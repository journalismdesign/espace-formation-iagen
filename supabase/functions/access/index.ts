// =====================================================================
// Fonction Edge « access » : connexion des stagiaires par code personnel.
//
//  request { session_id, first_name, email }
//    → vérifie le prénom, refuse les adresses de l'équipe et, si la session
//      est « sur invitation », les adresses non invitées ; applique des limites
//      (par adresse IP, par session, nombre d'e-mails par jour) ; génère un code
//      de 6 caractères valable jusqu'à la fin de la formation, l'envoie, puis
//      seulement l'enregistre (empreinte SHA-256 + poivre). Aucun compte n'est
//      créé à cette étape.
//  verify  { session_id, email, code }
//    → essai compté de façon atomique (try_access_code, 8 essais au plus),
//      crée le compte au premier code juste, rattache à la session, puis ouvre
//      une session Supabase via un jeton à usage unique (verifyOtp côté navigateur).
//
// Secrets obligatoires : BREVO_API_KEY, MAIL_FROM (ex. formation@journalism.design),
//   CODE_PEPPER (chaîne aléatoire longue), ALLOWED_ORIGIN (ex. https://formation.journalism.design).
// Facultatif : MAIL_FROM_NAME (le nom réglé dans le back-office l'emporte).
// Nécessite la migration 20261124040000_durcissement.sql (throttle_hit, try_access_code, access_mode).
// Déploiement : supabase functions deploy access --no-verify-jwt
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const PEPPER = Deno.env.get("CODE_PEPPER") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN || "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L
const RESEND_DELAY_S = 45;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOO_MANY = "trop de demandes : réessayez dans quelques minutes";

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join("");
}
async function hash(sid: string, email: string, code: string) {
  const data = new TextEncoder().encode(`${PEPPER}|${sid}|${email}|${code.toUpperCase()}`);
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

// Règles de la demande : bloc recopié de src/lib/accessRules.js, à garder identique (tests/access.test.mjs).
// >>> règles de la demande de code
// Limites anti-abus : [nombre d'appels, fenêtre en secondes]
export const ACCESS_LIMITS = { ip: [10, 600], session: [60, 3600], mails: [250, 86400], verifyIp: [40, 600] };
// Prénom saisi par le ou la stagiaire, repris dans l'e-mail : lettres seulement, pour qu'on ne puisse pas y glisser un lien
export function checkFirstName(v) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { error: "indiquez votre prénom" };
  if (s.length > 40) return { error: "prénom trop long (40 caractères au plus)" };
  if (!/^\p{L}[\p{L}\p{M} '’.-]*$/u.test(s) || /https?|www|\.\p{L}{2,}/iu.test(s))
    return { error: "prénom non valide : lettres, espaces, apostrophes et traits d'union seulement" };
  return { value: s };
}
// Première adresse de l'en-tête x-forwarded-for (posé par la plateforme Supabase)
export function clientIp(header) {
  return String(header ?? "").split(",")[0].trim() || "inconnue";
}
// <<< règles de la demande de code

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  // Sans poivre ni origine autorisée, on refuse de fonctionner plutôt que de tourner en mode dégradé
  if (!PEPPER || !ORIGIN) return json({ error: "service mal configuré (CODE_PEPPER ou ALLOWED_ORIGIN manquant)" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hit = async (bucket: string, [max, secs]: number[]) =>
    ((await admin.rpc("throttle_hit", { p_bucket: bucket, p_max: max, p_secs: secs })).data ?? false) as boolean;
  const ip = clientIp(req.headers.get("x-forwarded-for"));

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "requête illisible" }, 400); }
  const action = body?.action;
  const sid = String(body?.session_id ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) return json({ error: "adresse e-mail invalide" }, 400);

  const { data: s } = await admin.from("sessions").select("id, title, status, access_mode").eq("id", sid).maybeSingle();
  if (!s || s.status === "closed") return json({ error: "session inconnue ou close" }, 404);
  await admin.rpc("purge_access_codes");

  // Les comptes de l'équipe passent par l'espace formateur, jamais par le code stagiaire
  const { data: staff } = await admin.rpc("staff_role", { p_email: email });
  const { data: prof } = await admin.from("profiles").select("id, full_name, role").eq("email", email).maybeSingle();
  if (staff || (prof && prof.role !== "trainee"))
    return json({ error: "cette adresse appartient à l'équipe : connectez-vous par l'espace formateur" }, 403);

  if (action === "request") {
    const fn = checkFirstName(body?.first_name);
    if (fn.error) return json({ error: fn.error }, 400);
    const first = fn.value as string;

    // Session « sur invitation » : adresse invitée, ou personne déjà inscrite
    if (s.access_mode === "invites") {
      const { data: inv } = await admin.from("session_invites").select("email").eq("session_id", sid).eq("email", email).maybeSingle();
      const { data: mem } = prof ? await admin.from("session_members").select("user_id").eq("session_id", sid).eq("user_id", prof.id).maybeSingle() : { data: null };
      if (!inv && !mem) return json({ error: "cette session est réservée aux personnes invitées : vérifiez l'adresse indiquée à votre formateur·ice" }, 403);
    }

    const { data: prev } = await admin.from("access_codes").select("sent_at").eq("session_id", sid).eq("email", email).maybeSingle();
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < RESEND_DELAY_S * 1000)
      return json({ error: "un code vient d'être envoyé : patientez quelques secondes" }, 429);
    if (!(await hit("ip:" + ip, ACCESS_LIMITS.ip)) || !(await hit("session:" + sid, ACCESS_LIMITS.session)))
      return json({ error: TOO_MANY }, 429);
    if (!(await hit("mails", ACCESS_LIMITS.mails)))
      return json({ error: "trop d'e-mails envoyés aujourd'hui : demandez à votre formateur·ice de vous faire entrer" }, 429);

    const code = newCode();
    const { data: exp } = await admin.rpc("access_expiry", { p_session: sid });
    const until = new Date(exp).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
    // Texte réglé dans le back-office (Réglages généraux → E-mail stagiaires), sinon texte par défaut
    const { data: rows } = await admin.from("app_settings").select("key, value").in("key", ["mail_from_name", "mail_subject", "mail_body"]);
    const t: Record<string, string> = Object.fromEntries((rows ?? []).map((r: { key: string; value: string | null }) => [r.key, r.value ?? ""]));
    const m = renderCodeMail({ subject: t.mail_subject, body: t.mail_body }, { prenom: first, formation: s.title, code, validite: until });
    try {
      await sendMail(email, first, m.subject, m.html, m.text, (t.mail_from_name || "").trim() || undefined);
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
    // Enregistré seulement une fois l'e-mail parti : un envoi raté n'annule pas le code précédent
    await admin.from("access_codes").upsert({
      session_id: sid, email, first_name: first, code_hash: await hash(sid, email, code),
      expires_at: exp, attempts: 0, sent_at: new Date().toISOString(),
    });
    return json({ sent: true, expires_at: exp });
  }

  if (action === "verify") {
    if (!(await hit("verify-ip:" + ip, ACCESS_LIMITS.verifyIp))) return json({ error: TOO_MANY }, 429);
    const code = String(body?.code ?? "").trim().toUpperCase().replace(/\s/g, "").slice(0, 12);
    const r = String((await admin.rpc("try_access_code", { p_session: sid, p_email: email, p_hash: await hash(sid, email, code) })).data ?? "none");
    if (r === "none") return json({ error: "aucun code valide pour cette adresse : demandez-en un nouveau" }, 404);
    if (r === "locked") return json({ error: "trop d'essais : demandez un nouveau code" }, 429);
    if (r.startsWith("bad:")) return json({ error: `code incorrect (${r.slice(4)} essai(s) restant(s))` }, 401);

    // Premier code juste : compte créé seulement maintenant, prénom repris du code
    let uid = prof?.id as string | undefined;
    if (!uid) {
      const { data: row } = await admin.from("access_codes").select("first_name").eq("session_id", sid).eq("email", email).maybeSingle();
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: row?.first_name ?? "" } });
      if (error) return json({ error: "création du compte impossible" }, 500);
      uid = created.user!.id;
    } else if (!prof!.full_name) {
      const { data: row } = await admin.from("access_codes").select("first_name").eq("session_id", sid).eq("email", email).maybeSingle();
      if (row?.first_name) await admin.from("profiles").update({ full_name: row.first_name }).eq("id", uid);
    }
    await admin.from("session_members").upsert({ session_id: sid, user_id: uid }, { onConflict: "session_id,user_id", ignoreDuplicates: true });
    // Le code reste valable jusqu'à la fin de la formation (autre appareil, navigateur vidé)
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link?.properties?.hashed_token) return json({ error: "ouverture de session impossible" }, 500);
    return json({ token_hash: link.properties.hashed_token });
  }

  return json({ error: "action inconnue" }, 400);
});
