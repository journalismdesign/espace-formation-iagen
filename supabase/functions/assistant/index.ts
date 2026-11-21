// =====================================================================
// Fonction Edge « assistant » : relais vers l'API d'un modèle de langage.
// La clé d'API reste côté serveur (secret ANTHROPIC_API_KEY), jamais dans
// le navigateur. Chaque appel est authentifié, plafonné par jour et par
// personne, et les générations de pistes du cadrage sont comptées.
//
// Modes :
//   assistant : questions sur les ressources de la formation (corpus fourni)
//   pistes    : 3 cas d'usage proposés à partir du besoin du cadrage
//   analyse   : analyse V1/V2 du cas d'usage retenu
//
// Déploiement : supabase functions deploy assistant
// Secrets      : supabase secrets set ANTHROPIC_API_KEY=… [AI_MODEL=…] [AI_DAILY_LIMIT=…]
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5";
const DAILY = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "60");
const MAX_PISTES = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYS_PISTES = `Tu aides des journalistes à cadrer un premier cas d'usage de l'IA générative avant une formation. La formation couvre Gemini Notebook (anciennement NotebookLM : interroger ses propres sources) puis les assistants conversationnels (ChatGPT, Claude, Gemini, Mistral Le Chat) avec la méthode R·M·C·T·F pour les demandes ponctuelles et S·V·E (spécification, vérification, environnement) pour les travaux suivis.
Propose exactement trois cas d'usage réalistes, réalisables en une journée, utiles au travail décrit. Jamais de rédaction automatique d'articles publiés sans relecture ; toujours une étape de vérification humaine. Signale si le besoin implique des données sensibles (sources, données personnelles, documents sous embargo).
Réponds UNIQUEMENT par un tableau JSON : [{"titre":"…","description":"2 à 3 phrases","outil":"Gemini Notebook" | "Assistant conversationnel" | "Les deux","niveau":"accessible" | "intermédiaire"}]`;

const SYS_ANALYSE = `Tu relis le cas d'usage d'IA générative qu'un·e journaliste a cadré avant une formation. Sois direct, sans flatterie, en français. Structure ta réponse en quatre parties courtes avec ces titres exacts :
FAISABILITÉ — ce qui est réaliste en une journée, ce qui ne l'est pas.
DONNÉES ET RISQUES — ce qu'on peut confier à un outil grand public, ce qu'il faut anonymiser, ce qui est exclu (code couleur : jamais, avec précaution, sans risque).
PREMIER PROMPT R·M·C·T·F — un prompt prêt à copier, avec les lettres RÔLE, MISSION, CONTEXTE, TÂCHE, FORMAT, et la mention « Si tu ne sais pas, dis-le. N'invente ni chiffre, ni citation, ni source. »
VÉRIFICATION — trois critères concrets pour juger le résultat avant tout usage éditorial.
200 à 350 mots au total.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "clé d'API absente côté serveur" }, 503);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "non connecté" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "requête illisible" }, 400); }
  const { mode, session_id } = body ?? {};

  // Accès à la session : passe par les droits de l'utilisateur (RLS)
  const { data: sess } = await userClient.from("sessions").select("id").eq("id", session_id).maybeSingle();
  if (!sess) return json({ error: "session inaccessible" }, 403);

  // Plafond quotidien
  const today = new Date().toISOString().slice(0, 10);
  const { data: use } = await admin.from("ai_usage").select("n").eq("user_id", user.id).eq("day", today).maybeSingle();
  if ((use?.n ?? 0) >= DAILY) return json({ error: `plafond quotidien atteint (${DAILY} demandes)` }, 429);

  let system = "", messages: { role: string; content: string }[] = [], maxTokens = 900;

  if (mode === "assistant") {
    const corpus = String(body.corpus ?? "").slice(0, 60000);
    system = String(body.system ?? "").slice(0, 2000) + "\n\nCORPUS\n" + corpus;
    messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    maxTokens = 700;
  } else if (mode === "pistes" || mode === "analyse") {
    const { data: proj } = await admin.from("projects").select("id, user_id, ai_generations")
      .eq("session_id", session_id).eq("user_id", user.id).maybeSingle();
    if (!proj) return json({ error: "cadrage introuvable" }, 404);
    if (mode === "pistes") {
      if (proj.ai_generations >= MAX_PISTES) return json({ error: "plus de génération disponible" }, 429);
      await admin.from("projects").update({ ai_generations: proj.ai_generations + 1 }).eq("id", proj.id);
    }
    system = mode === "pistes" ? SYS_PISTES : SYS_ANALYSE;
    messages = [{ role: "user", content: JSON.stringify(body.payload ?? {}).slice(0, 8000) }];
  } else {
    return json({ error: "mode inconnu" }, 400);
  }
  if (!messages.length) return json({ error: "message vide" }, 400);

  await admin.from("ai_usage").upsert({ user_id: user.id, day: today, n: (use?.n ?? 0) + 1 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!r.ok) return json({ error: "le modèle n'a pas répondu", detail: (await r.text()).slice(0, 300) }, 502);
  const out = await r.json();
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  return json({ text });
});
