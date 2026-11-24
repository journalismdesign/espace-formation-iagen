// =====================================================================
// Fonction Edge « access » : connexion des stagiaires par code personnel.
//
//  request { session_id, first_name, email }
//    → crée le compte si besoin, rattache à la session, génère un code
//      unique de 6 caractères valable jusqu'à la fin de la formation
//      (dernier jour, 23 h 59, heure de Paris) et l'envoie par e-mail.
//      Le code n'est stocké que sous forme d'empreinte (SHA-256 + poivre).
//  verify  { session_id, email, code }
//    → vérifie le code (8 essais au plus), puis ouvre une session
//      Supabase via un jeton à usage unique (verifyOtp côté navigateur).
//
// Secrets : BREVO_API_KEY, MAIL_FROM (ex. formation@journalism.design),
//           MAIL_FROM_NAME (facultatif), CODE_PEPPER (chaîne aléatoire longue)
// Déploiement : supabase functions deploy access --no-verify-jwt
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L
const MAX_ATTEMPTS = 8;
const RESEND_DELAY_S = 45;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join("");
}
async function hash(sid: string, email: string, code: string) {
  const data = new TextEncoder().encode(`${Deno.env.get("CODE_PEPPER") ?? ""}|${sid}|${email}|${code.toUpperCase()}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Modèle de l'e-mail du code : texte réglable dans le back-office (Réglages généraux → app_settings
// mail_from_name, mail_subject, mail_body). Bloc recopié de src/lib/codeMail.js, à garder identique
// (tests/mail.test.mjs le vérifie).
// >>> modèle du mail du code d'accès
export const MAIL_DEFAULTS = {
  from_name: "Formation IA générative",
  subject: "Votre code d'accès : {code}",
  body: "Bonjour {prenom},\n\nVoici votre code d'accès personnel à la formation « {formation} » :\n\n{code}\n\nIl est valable jusqu'au {validite}, sur tous vos appareils, puis il sera détruit. Ne le transmettez pas.",
};
const escMail = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// t = { subject, body } (vides = texte par défaut) ; v = { prenom, formation, code, validite }
export function renderCodeMail(t, v) {
  const fill = (s, f) => s.replace(/\{(prenom|formation|code|validite)\}/g, (_m, k) => f(k));
  let body = String(t.body || "").trim() || MAIL_DEFAULTS.body;
  if (!body.includes("{code}")) body += "\n\n{code}"; // le code doit toujours arriver
  const subject = fill(String(t.subject || "").trim() || MAIL_DEFAULTS.subject, (k) => v[k]);
  const text = fill(body, (k) => v[k]);
  const html = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => (p === "{code}"
    ? `<p style="font-size:28px;font-weight:800;letter-spacing:4px;font-family:monospace">${escMail(v.code)}</p>`
    : `<p>${fill(escMail(p), (k) => (k === "code" ? `<b style="font-family:monospace;letter-spacing:2px">${escMail(v.code)}</b>` : escMail(v[k]))).replace(/\n/g, "<br>")}</p>`)).join("\n");
  return { subject, text, html };
}
// <<< modèle du mail du code d'accès

async function sendMail(to: string, name: string, subject: string, html: string, text: string, fromName?: string) {
  const key = Deno.env.get("BREVO_API_KEY");
  if (!key) throw new Error("envoi d'e-mail non configuré (BREVO_API_KEY)");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: Deno.env.get("MAIL_FROM"), name: fromName || Deno.env.get("MAIL_FROM_NAME") || MAIL_DEFAULTS.from_name },
      to: [{ email: to, name }], subject, htmlContent: html, textContent: text,
    }),
  });
  if (!r.ok) {
    // Brevo explique la cause (clé inconnue, adresse IP non autorisée, expéditeur non validé…) : on la garde dans les journaux
    const detail = await r.text().catch(() => "");
    console.error("Brevo", r.status, detail);
    let hint = "";
    if (r.status === 401) hint = /ip/i.test(detail) ? " : adresse IP refusée par Brevo (désactivez le blocage des IP dans Brevo → Sécurité)" : " : clé Brevo refusée (BREVO_API_KEY doit être une clé API xkeysib-, pas une clé SMTP)";
    else if (r.status === 400 && /sender/i.test(detail)) hint = " : expéditeur refusé (MAIL_FROM doit être une adresse du domaine validé dans Brevo)";
    throw new Error("l'e-mail n'a pas pu partir (" + r.status + ")" + hint);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "requête illisible" }, 400); }
  const action = body?.action;
  const sid = String(body?.session_id ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "adresse e-mail invalide" }, 400);

  const { data: s } = await admin.from("sessions").select("id, title, status, date, date2, format").eq("id", sid).maybeSingle();
  if (!s || s.status === "closed") return json({ error: "session inconnue ou close" }, 404);
  await admin.rpc("purge_access_codes");

  if (action === "request") {
    const first = String(body?.first_name ?? "").trim().slice(0, 60);
    if (!first) return json({ error: "indiquez votre prénom" }, 400);

    const { data: prev } = await admin.from("access_codes").select("sent_at").eq("session_id", sid).eq("email", email).maybeSingle();
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < RESEND_DELAY_S * 1000)
      return json({ error: "un code vient d'être envoyé : patientez quelques secondes" }, 429);

    // Compte : créé à la première demande, prénom repris dans le profil
    let uid: string | null = null;
    const { data: prof } = await admin.from("profiles").select("id, full_name").eq("email", email).maybeSingle();
    if (prof) {
      uid = prof.id;
      if (!prof.full_name) await admin.from("profiles").update({ full_name: first }).eq("id", uid);
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: first } });
      if (error) return json({ error: "création du compte impossible" }, 500);
      uid = created.user!.id;
    }
    await admin.from("session_members").upsert({ session_id: sid, user_id: uid }, { onConflict: "session_id,user_id", ignoreDuplicates: true });

    const code = newCode();
    const { data: exp } = await admin.rpc("access_expiry", { p_session: sid });
    await admin.from("access_codes").upsert({
      session_id: sid, email, first_name: first, code_hash: await hash(sid, email, code),
      expires_at: exp, attempts: 0, sent_at: new Date().toISOString(),
    });
    const until = new Date(exp).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
    // Texte réglé dans le back-office (Réglages généraux), sinon texte par défaut
    const { data: rows } = await admin.from("app_settings").select("key, value").in("key", ["mail_from_name", "mail_subject", "mail_body"]);
    const t: Record<string, string> = Object.fromEntries((rows ?? []).map((r: { key: string; value: string | null }) => [r.key, r.value ?? ""]));
    const m = renderCodeMail({ subject: t.mail_subject, body: t.mail_body }, { prenom: first, formation: s.title, code, validite: until });
    try {
      await sendMail(email, first, m.subject, m.html, m.text, (t.mail_from_name || "").trim() || undefined);
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
    return json({ sent: true, expires_at: exp });
  }

  if (action === "verify") {
    const code = String(body?.code ?? "").trim().toUpperCase().replace(/\s/g, "");
    const { data: row } = await admin.from("access_codes").select("*").eq("session_id", sid).eq("email", email).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return json({ error: "aucun code valide pour cette adresse : demandez-en un nouveau" }, 404);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: "trop d'essais : demandez un nouveau code" }, 429);
    if ((await hash(sid, email, code)) !== row.code_hash) {
      await admin.from("access_codes").update({ attempts: row.attempts + 1 }).eq("session_id", sid).eq("email", email);
      return json({ error: `code incorrect (${MAX_ATTEMPTS - row.attempts - 1} essai(s) restant(s))` }, 401);
    }
    await admin.from("access_codes").update({ attempts: 0 }).eq("session_id", sid).eq("email", email);
    // Le code reste valable jusqu'à la fin de la formation (autre appareil, navigateur vidé)
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link?.properties?.hashed_token) return json({ error: "ouverture de session impossible" }, 500);
    const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (prof) await admin.from("session_members").upsert({ session_id: sid, user_id: prof.id }, { onConflict: "session_id,user_id", ignoreDuplicates: true });
    return json({ token_hash: link.properties.hashed_token });
  }

  return json({ error: "action inconnue" }, 400);
});
