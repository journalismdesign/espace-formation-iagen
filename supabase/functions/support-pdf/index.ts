// =====================================================================
// Fonction Edge « support-pdf » : support PDF d'une session, depuis son deck Google Slides.
//
//  POST { session_id, label, skip, drop_skipped }  + en-tête Authorization de l'équipe
//    → réservé à l'administration et aux formateur·ices qui pilotent la session (manages(), évaluée avec le jeton
//      de l'appelant) ; pas aux invité·es (il·elles pourraient pointer une démo vers un autre deck) ; 6 générations
//      par 10 minutes et par compte (throttle_hit).
//    → le deck vient de la session (sessions.slides_url, lu ici, jamais du navigateur) : n'importe quelle session,
//      ancienne ou créée de zéro, du moment que ses slides sont un Google Slides du compte qui a déployé l'Apps Script.
//    → appelle l'Apps Script google/support-pdf.gs (copie, date de la slide 1, PDF dans le dossier du deck) et
//      renvoie { url, name, found, removed }. Le navigateur enregistre ensuite l'url comme support de la session.
//
// Secrets : SUPPORT_SCRIPT_URL (URL /exec de l'application Web Apps Script), SUPPORT_SCRIPT_TOKEN (même valeur que
//   la propriété TOKEN du script), ALLOWED_ORIGIN (déjà posé pour la fonction access).
// Déploiement : supabase functions deploy support-pdf --no-verify-jwt (la fonction vérifie elle-même le jeton de
//   l'appelant ; la vérification de la passerelle bloquerait la requête de contrôle CORS du navigateur)
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const SCRIPT_URL = Deno.env.get("SUPPORT_SCRIPT_URL") ?? "";
const SCRIPT_TOKEN = Deno.env.get("SUPPORT_SCRIPT_TOKEN") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN || "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Même règle que deckId (src/deck.js) ; les présentations « publiées sur le web » (d/e/…) ne s'exportent pas
const DECK_RE = /presentation\/(?:u\/\d+\/)?d\/([\w-]{20,})/;
// Même règle que COVER_LABEL_RE (src/lib/coverDate.js) : 80 caractères au plus, terminée par une année
const LABEL_RE = /^[\p{L}\d][\p{L}\d ,\-–]{0,74}\d{4}$/u;
const LIMIT: [number, number] = [6, 600];
const TIMEOUT_MS = 140_000;

function bearer(header: string | null) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header ?? "").trim());
  return m ? m[1] : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  if (!ORIGIN) return json({ error: "service mal configuré (ALLOWED_ORIGIN manquant)" }, 500);
  if (!SCRIPT_URL || !SCRIPT_TOKEN) return json({ error: "génération du support pas encore configurée (SUPPORT_SCRIPT_URL, SUPPORT_SCRIPT_TOKEN)" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "requête illisible" }, 400); }
  const sid = String(body?.session_id ?? "");
  const label = String(body?.label ?? "").trim();
  if (!LABEL_RE.test(label)) return json({ error: "date de page de garde invalide" }, 400);
  const skipIn = Array.isArray(body?.skip) ? body.skip : [];
  if (skipIn.length > 300) return json({ error: "trop de pages masquées" }, 400);
  const skip = [...new Set(skipIn.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 500))];

  // Appelant : compte de l'équipe (formateur·ice ou admin) qui pilote cette session
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = bearer(req.headers.get("authorization"));
  const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  const caller = who?.user;
  if (!caller) return json({ error: "connectez-vous à l'espace formateur" }, 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  if (!prof || !["trainer", "admin"].includes(prof.role)) return json({ error: "réservé à l'équipe pédagogique" }, 403);
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: can } = await asCaller.rpc("manages", { sid });
  if (can !== true) return json({ error: "réservé à l'équipe qui pilote cette session" }, 403);
  const { data: okHit } = await admin.rpc("throttle_hit", { p_bucket: "support-pdf:" + caller.id, p_max: LIMIT[0], p_secs: LIMIT[1] });
  if (okHit === false) return json({ error: "trop de générations : réessayez dans quelques minutes" }, 429);

  // Deck de la session
  const { data: s } = await admin.from("sessions").select("id, slides_url").eq("id", sid).maybeSingle();
  if (!s) return json({ error: "session inconnue" }, 404);
  const deckId = DECK_RE.exec(String(s.slides_url ?? ""))?.[1] ?? (/^[\w-]{25,}$/.test(String(s.slides_url ?? "").trim()) ? String(s.slides_url).trim() : "");
  if (!deckId) return json({ error: "aucune présentation Google Slides pour cette session (Réglages → Slides projetées)" }, 400);

  // Apps Script : la réponse arrive après une redirection de Google (suivie par fetch)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let text = "";
  try {
    const r = await fetch(SCRIPT_URL, {
      method: "POST", redirect: "follow", signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: SCRIPT_TOKEN, deckId, label, skip, dropSkipped: body?.drop_skipped !== false }),
    });
    text = await r.text();
  } catch (e) {
    return json({ error: (e as Error).name === "AbortError" ? "Google met trop de temps à répondre : réessayez dans un instant" : "Google Apps Script injoignable" }, 504);
  } finally { clearTimeout(timer); }
  let out: any;
  try { out = JSON.parse(text); } catch { return json({ error: "réponse inattendue de Google : vérifiez le déploiement de l'Apps Script (accès « tout le monde »)" }, 502); }
  if (!out?.ok) return json({ error: out?.error || "échec de la génération" }, 422);
  if (!/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/.test(String(out.url))) return json({ error: "lien de PDF inattendu" }, 502);
  return json({ url: out.url, name: out.name, found: out.found, removed: out.removed ?? 0 });
});
