/* Fin de formation et archivage (pur, testé dans tests/archive.test.mjs).
   - Une session est terminée quand elle est close, quand son dernier jour est passé, ou le dernier jour quand la
     salle est fermée après l'heure de fin de la journée.
   - Elle est archivée ARCHIVE_DAYS jours après son dernier jour (heure de Paris) : les stagiaires n'y ont plus
     accès (côté base : migration …_archives.sql), l'équipe la retrouve dans « Sessions archivées ».
   Toutes les dates sont des chaînes AAAA-MM-JJ (heure de Paris), les heures des chaînes HH:MM. */
export const ARCHIVE_DAYS = 5;
export const ARCHIVE_CONTACT = "formations@journalism.design";
// Clôture automatique : au plus tard 15 minutes après l'heure de fin des réglages (end_time), le dernier jour
export const AUTO_CLOSE_MIN = 15;
export const plusMin = (hm, n) => { const [h, m] = String(hm || "0:0").slice(0, 5).split(":").map(Number); const t = (h || 0) * 60 + (m || 0) + n; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export const parisToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
export const parisHM = () => new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

const at = (d) => Date.parse(d + "T12:00:00Z");
export const addDays = (d, n) => new Date(at(d) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((at(to) - at(from)) / 864e5);

/* Journées : de 1 à 5 (sessions.format, '1' à '5'), une date chacune (sessions.dates, migration …_journees.sql).
   Sans `dates` (sessions d'avant, ou migration pas encore exécutée) : date pour le jour 1, date2 pour le jour 2. */
export const MAX_DAYS = 5;
export const dayCount = (s) => Math.min(MAX_DAYS, Math.max(1, parseInt(s?.format, 10) || 1));
export const dateOfDay = (s, d) => s?.dates?.[d - 1] || (d === 1 ? s?.date : d === 2 && dayCount(s) > 1 ? s?.date2 : null) || null;
// Dates des journées de formation, dans l'ordre (celles qui sont renseignées)
export const trainingDates = (s) => Array.from({ length: dayCount(s) }, (_, i) => dateOfDay(s, i + 1)).filter(Boolean);
export const lastDate = (s) => trainingDates(s).at(-1) || null;
export const archiveDate = (s) => { const d = lastDate(s); return d ? addDays(d, ARCHIVE_DAYS) : null; };
export const isArchived = (s, today = parisToday()) => { const a = archiveDate(s); return !!a && today >= a; };
// Jours d'accès restants avant l'archivage (null sans date)
export const daysLeft = (s, today = parisToday()) => { const a = archiveDate(s); return a ? Math.max(0, daysBetween(today, a)) : null; };

/* Formation terminée : close ; ou dernier jour passé ; ou, le dernier jour, 15 minutes après l'heure de fin des réglages
   (clôture automatique, même salle ouverte : close_finished_sessions la ferme côté base) ; ou, le dernier jour, salle
   fermée après l'heure de fin de la journée du déroulé (`endOf(n)`, fin de journée modifiée comprise). */
export function sessionEnded(s, { today = parisToday(), hm = parisHM(), endOf = () => null } = {}) {
  if (!s) return false;
  if (s.status === "closed") return true;
  const dates = trainingDates(s), last = dates.at(-1);
  if (!last) return false;
  if (today > last) return true;
  if (today < last) return false;
  if (s.end_time && hm >= plusMin(s.end_time, AUTO_CLOSE_MIN)) return true;
  if (s.status === "live") return false;
  const end = endOf(dates.length);
  return !!end && hm >= end;
}

/* Entre deux journées : la salle est fermée après la fin d'une journée qui n'est pas la dernière.
   Renvoie la date de la journée suivante (pour « La formation reprendra le … »), sinon null. */
export function nextTrainingDay(s, { today = parisToday(), hm = parisHM(), endOf = () => null } = {}) {
  if (!s || s.status === "live") return null;
  const dates = trainingDates(s), i = dates.indexOf(today);
  if (i < 0 || i === dates.length - 1) return null;
  const end = endOf(i + 1);
  return end && hm >= end ? dates[i + 1] : null;
}

// « 5 jours », « 1 jour »
export const joursTxt = (n) => `${n} jour${n > 1 ? "s" : ""}`;
