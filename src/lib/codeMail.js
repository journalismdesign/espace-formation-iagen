/* E-mail du code d'accès envoyé aux stagiaires (fonction Edge « access »).
   Le texte se règle dans Réglages généraux (app_settings : mail_from_name, mail_subject, mail_body) ;
   vide = texte par défaut. Champs remplacés : {prenom}, {formation}, {code}, {validite}.
   Le bloc entre les deux repères est recopié tel quel dans supabase/functions/access/index.ts
   (la fonction ne peut rien importer de src/) : tests/mail.test.mjs vérifie qu'ils restent identiques. */

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

export const MAIL_FIELDS = ["prenom", "formation", "code", "validite"];
