/* Déroulé d'une session : pauses de 15 minutes déplaçables et alerte avant chaque pause.
   - Une pause de 15 minutes (type pause, hors déjeuner) se déplace dans sa demi-journée, entre deux séquences :
     le déjeuner reste fixe, chaque séquence garde sa durée, les horaires de la demi-journée sont recalculés
     en cascade depuis son début (la fin de la demi-journée ne change pas si le déroulé n'a pas de trou).
   - pauseAlert : pause (de 15 minutes ou déjeuner) qui commence dans les deux minutes, le jour prévu.
   Module pur (pas de DOM) : importé par les tests. */

export const isLunch = (m) => m?.type === "pause" && /jeuner/i.test(m.titre || "");
export const isShortPause = (m) => m?.type === "pause" && !isLunch(m);
const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const toHHMM = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const dayOf = (m) => m.day || 1;

// Demi-journée d'un élément : indices [a, b) des éléments du même jour, du même côté du déjeuner
export function halfDay(modules, i) {
  const day = dayOf(modules[i]);
  let a = i, b = i + 1;
  while (a > 0 && dayOf(modules[a - 1]) === day && !isLunch(modules[a - 1])) a--;
  while (b < modules.length && dayOf(modules[b]) === day && !isLunch(modules[b])) b++;
  return [a, b];
}

// Places possibles d'une pause : avant chaque élément de sa demi-journée, sauf le premier (une pause tombe entre deux séquences)
export function pauseTargets(modules, pauseId) {
  const i = modules.findIndex((m) => m.id === pauseId);
  if (i < 0 || !isShortPause(modules[i])) return [];
  const [a, b] = halfDay(modules, i);
  return modules.slice(a, b).filter((m) => m.id !== pauseId).slice(1).map((m) => m.id);
}

// Déplace la pause juste avant l'élément beforeId (même demi-journée) : nouveau tableau, ou null si la place est refusée
export function movePause(modules, pauseId, beforeId) {
  if (!pauseTargets(modules, pauseId).includes(beforeId)) return null;
  const i = modules.findIndex((m) => m.id === pauseId);
  const [a, b] = halfDay(modules, i);
  const seg = modules.slice(a, b).map((m) => ({ ...m, t: [...m.t] }));
  const [p] = seg.splice(i - a, 1);
  seg.splice(seg.findIndex((m) => m.id === beforeId), 0, p);
  let t = toMin(modules[a].t[0]);
  for (const m of seg) { const d = toMin(m.t[1]) - toMin(m.t[0]); m.t = [toHHMM(t), toHHMM(t + d)]; t += d; }
  return [...modules.slice(0, a), ...seg, ...modules.slice(b)];
}

// Avance (dir = -1) ou recule (dir = 1) la pause d'une séquence, dans sa demi-journée : nouveau tableau ou null
export function shiftPause(modules, pauseId, dir) {
  const i = modules.findIndex((m) => m.id === pauseId);
  if (i < 0 || !isShortPause(modules[i])) return null;
  const [a, b] = halfDay(modules, i);
  const others = modules.slice(a, b).filter((m) => m.id !== pauseId);
  const k = i - a + dir; // rang de l'élément devant lequel placer la pause, parmi les autres
  return k >= 1 && k < others.length ? movePause(modules, pauseId, others[k].id) : null;
}

/* Alerte du pilotage : pause qui commence dans les deux minutes (jusqu'à une minute après son début).
   dateOf(jour) : date AAAA-MM-JJ de la journée (null : sans date, on suppose aujourd'hui).
   Renvoie { m, left } (left : secondes avant le début, négatif après) ou null. */
export function pauseAlert(modules, dateOf, now = new Date()) {
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const [h, mi, s] = now.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour12: false }).split(":").map(Number);
  const sec = h * 3600 + mi * 60 + s;
  for (const m of modules) {
    if (m.type !== "pause") continue;
    const d = dateOf(dayOf(m));
    if (d && d !== date) continue;
    const left = toMin(m.t[0]) * 60 - sec;
    if (left <= 120 && left > -60) return { m, left };
  }
  return null;
}
// Texte de l'alerte : « La pause commence dans 2 minutes », « Le déjeuner commence dans 1 minute », « C'est l'heure de la pause »
export function pauseAlertText({ m, left }) {
  const what = isLunch(m) ? "Le déjeuner" : "La pause", n = Math.ceil(left / 60);
  if (left <= 0) return isLunch(m) ? "C'est l'heure du déjeuner" : "C'est l'heure de la pause";
  return `${what} commence dans ${n} minute${n > 1 ? "s" : ""}`;
}
