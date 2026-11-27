/* Fin de formation et archivage (pur, testé dans tests/archive.test.mjs).
   - Une session est terminée quand elle est close, quand son dernier jour est passé, ou le dernier jour quand la
     salle est fermée après l'heure de fin de la journée.
   - Elle est archivée ARCHIVE_DAYS jours après son dernier jour (heure de Paris) : les stagiaires n'y ont plus
     accès (côté base : migration …_archives.sql), l'équipe la retrouve dans « Sessions archivées ».
   Toutes les dates sont des chaînes AAAA-MM-JJ (heure de Paris), les heures des chaînes HH:MM. */
export const ARCHIVE_DAYS = 5;
export const ARCHIVE_CONTACT = "formations@journalism.design";

export const parisToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
export const parisHM = () => new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

const at = (d) => Date.parse(d + "T12:00:00Z");
export const addDays = (d, n) => new Date(at(d) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((at(to) - at(from)) / 864e5);

// Dates des journées de formation, dans l'ordre (le jour 2 seulement pour une formation de deux journées)
export const trainingDates = (s) => [s?.date, s?.format === "2" ? s?.date2 : null].filter(Boolean);
export const lastDate = (s) => trainingDates(s).at(-1) || null;
export const archiveDate = (s) => { const d = lastDate(s); return d ? addDays(d, ARCHIVE_DAYS) : null; };
export const isArchived = (s, today = parisToday()) => { const a = archiveDate(s); return !!a && today >= a; };
// Jours d'accès restants avant l'archivage (null sans date)
export const daysLeft = (s, today = parisToday()) => { const a = archiveDate(s); return a ? Math.max(0, daysBetween(today, a)) : null; };

/* Formation terminée. `endOf(n)` : heure de fin de la journée n (déroulé, fin de journée modifiée comprise) ;
   le dernier jour, salle fermée après cette heure, la formation est finie (plus de « va reprendre »). */
export function sessionEnded(s, { today = parisToday(), hm = parisHM(), endOf = () => null } = {}) {
  if (!s) return false;
  if (s.status === "closed") return true;
  const dates = trainingDates(s), last = dates.at(-1);
  if (!last) return false;
  if (today > last) return true;
  if (today < last || s.status === "live") return false;
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
