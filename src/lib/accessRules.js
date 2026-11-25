/* Règles de la demande de code d'accès (fonction Edge « access »), testées par tests/access.test.mjs.
   Le bloc entre les deux repères est recopié tel quel dans supabase/functions/access/index.ts
   (la fonction ne peut rien importer de src/) ; le test vérifie que les deux copies restent identiques. */

// >>> règles de la demande de code
// Limites anti-abus : [nombre d'appels, fenêtre en secondes]
// issue : codes remis à la main par l'équipe (sans e-mail), par compte
export const ACCESS_LIMITS = { ip: [10, 600], session: [60, 3600], mails: [250, 86400], verifyIp: [40, 600], issue: [60, 3600] };
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
// Jeton de l'en-tête Authorization (« Bearer … ») ; chaîne vide s'il manque
export function bearer(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header ?? "").trim());
  return m ? m[1] : "";
}
// <<< règles de la demande de code
