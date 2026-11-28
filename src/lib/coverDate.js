/* Date de la page de garde du support PDF (slide 1 du deck Google Slides de la session), au style des decks : trait
   d'union entouré d'espaces. Pur, testé dans tests/coverDate.test.mjs.
   - une journée : « 27 novembre 2026 » ;
   - deux journées qui se suivent : « 19 - 20 novembre 2026 », « 1er - 2 décembre 2026 », « 30 novembre - 1er décembre
     2026 », « 31 décembre 2026 - 1er janvier 2027 » ;
   - journées qui ne se suivent pas, ou plus de deux : « 1er, 8 et 15 décembre 2026 », « 30 novembre et 2 décembre 2026 ».
   COVER_DATE_SOURCE est le motif qui retrouve la date déjà présente sur la slide 1 (n'importe laquelle de ces formes).
   Il est recopié dans google/support-pdf.gs entre les mêmes repères : le test vérifie que les deux copies sont
   identiques. */
import { trainingDates } from "./archive.js";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const parts = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return { y, m: m - 1, d }; };
const day = (d) => (d === 1 ? "1er" : String(d));
const follows = (a, b) => { const x = new Date(Date.UTC(a.y, a.m, a.d + 1)); return x.getUTCFullYear() === b.y && x.getUTCMonth() === b.m && x.getUTCDate() === b.d; };

export function coverDate(session) {
  const P = [...new Set(trainingDates(session).filter(Boolean))].sort().map(parts);
  if (!P.length) return "";
  const full = (p) => `${day(p.d)} ${MOIS[p.m]} ${p.y}`;
  if (P.length === 1) return full(P[0]);
  if (P.length === 2 && follows(P[0], P[1])) {
    const [a, b] = P;
    if (a.y !== b.y) return `${full(a)} - ${full(b)}`;
    if (a.m !== b.m) return `${day(a.d)} ${MOIS[a.m]} - ${full(b)}`;
    return `${day(a.d)} - ${full(b)}`;
  }
  const sameYear = P.every((p) => p.y === P[0].y), sameMonth = sameYear && P.every((p) => p.m === P[0].m);
  const items = P.map((p) => (sameMonth ? day(p.d) : sameYear ? `${day(p.d)} ${MOIS[p.m]}` : full(p)));
  const list = `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
  return sameMonth ? `${list} ${MOIS[P[0].m]} ${P[0].y}` : sameYear ? `${list} ${P[0].y}` : list;
}

// >>> motif de la date de page de garde
const DAY = "(?:1er|[0-3]?\\d)";
const MONTH = "(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)";
const ITEM = DAY + "(?:\\s+" + MONTH + "(?:\\s+\\d{4})?)?";
const SEP = "(?:\\s*[-–—,]\\s*|\\s+(?:et|au)\\s+)";
const COVER_DATE_SOURCE = "(?<!\\d)(?:" + ITEM + SEP + ")*" + DAY + "\\s+" + MONTH + "\\s+\\d{4}";
// <<< motif de la date de page de garde

export const COVER_DATE = new RegExp(COVER_DATE_SOURCE, "iu");
// Date de la page de garde valide pour la fonction support-pdf : 80 caractères au plus, terminée par une année
export const COVER_LABEL_RE = /^[\p{L}\d][\p{L}\d ,\-–]{0,74}\d{4}$/u;
