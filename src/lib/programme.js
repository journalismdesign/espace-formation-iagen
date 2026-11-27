/* Déroulé d'une session : pauses de 15 minutes déplaçables et alerte avant chaque pause.
   - Une pause de 15 minutes (type pause, hors déjeuner) se déplace dans sa demi-journée, entre deux séquences :
     le déjeuner reste fixe, chaque séquence garde sa durée, les horaires de la demi-journée sont recalculés
     en cascade depuis son début (la fin de la demi-journée ne change pas si le déroulé n'a pas de trou).
   - pauseAlert : pause (de 15 minutes ou déjeuner) qui commence dans les deux minutes, le jour prévu.
   - applyEnds : heure de fin de journée modifiée, l'après-midi se recale (voir plus bas).
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

/* Fin de la journée : heure modifiable pour chaque journée (sessions.programme.ends = { "1": "16:30", "2": "17:00" }).
   - Le bilan (les séquences qui commencent dans la dernière demi-heure, au moins la dernière : bilan, évaluation de
     fin de stage) garde sa durée et se termine à la nouvelle heure.
   - Les séquences de l'après-midi, entre le déjeuner et ce bilan, sont raccourcies ou allongées au prorata de leur
     durée, par pas de 5 minutes (5 minutes au moins chacune). Les pauses gardent leur durée et leur place.
   - Le matin ne bouge pas. Une heure hors bornes ou mal écrite est ignorée. */
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_END = 20 * 60;
export const dayEnd = (modules, day) => { const dm = modules.filter((m) => dayOf(m) === day); return dm.length ? dm[dm.length - 1].t[1] : null; };

// Découpage de l'après-midi d'une journée : indices, séquences ajustables, bornes possibles (en minutes) ; null si rien à ajuster
function afternoon(modules, day) {
  const idx = modules.map((m, i) => i).filter((i) => dayOf(modules[i]) === day);
  if (!idx.length) return null;
  const last = idx[idx.length - 1];
  let a = idx[0];
  for (const i of idx) if (isLunch(modules[i])) a = i + 1;
  if (a > last) return null;
  const dur = (m) => toMin(m.t[1]) - toMin(m.t[0]), base = toMin(modules[last].t[1]);
  let w = last; // début du bilan
  while (w - 1 >= a && modules[w - 1].type !== "pause" && toMin(modules[w - 1].t[0]) >= base - 30) w--;
  const flex = [], fixedDur = { pauses: 0, wind: 0 };
  for (let i = a; i <= last; i++) {
    if (i >= w) fixedDur.wind += dur(modules[i]);
    else if (modules[i].type === "pause") fixedDur.pauses += dur(modules[i]);
    else flex.push(i);
  }
  if (!flex.length) return null;
  const start = toMin(modules[a].t[0]);
  return { a, w, last, flex, start, base, min: start + fixedDur.pauses + fixedDur.wind + 5 * flex.length, max: Math.max(MAX_END, base), fixed: fixedDur.pauses + fixedDur.wind };
}

// Bornes de l'heure de fin d'une journée (déroulé sans ajustement) : { base, min, max, bilan } en HH:MM, ou null
export function endBounds(modules, day) {
  const p = afternoon(modules, day);
  return p ? { base: toHHMM(p.base), min: toHHMM(p.min), max: toHHMM(p.max), bilan: modules[p.w] } : null;
}

// Répartit total minutes entre des séquences, au prorata de leurs durées, par pas de 5 minutes (5 au moins chacune)
function spread(durs, total) {
  const B = durs.reduce((s, d) => s + d, 0), units = Math.floor(total / 5);
  const exact = durs.map((d) => (d / B) * units), out = exact.map((x) => Math.max(1, Math.floor(x)));
  let diff = units - out.reduce((s, x) => s + x, 0);
  const byRest = exact.map((x, i) => i).sort((i, j) => (exact[j] - Math.floor(exact[j])) - (exact[i] - Math.floor(exact[i])) || i - j);
  for (let k = 0; diff > 0; k = (k + 1) % out.length, diff--) out[byRest[k]]++;
  const big = () => out.reduce((b, x, i) => (x > out[b] ? i : b), 0);
  for (; diff < 0; diff++) out[big()]--;
  const res = out.map((u) => u * 5);
  res[res.length - 1] += total - units * 5;
  return res;
}

// Applique les heures de fin : nouveau tableau (le déroulé d'origine n'est pas modifié)
export function applyEnds(modules, ends) {
  if (!ends || typeof ends !== "object") return modules;
  let out = modules;
  for (const [k, v] of Object.entries(ends)) {
    const p = HHMM_RE.test(String(v)) ? afternoon(out, Number(k)) : null;
    const E = p ? toMin(v) : 0;
    if (!p || E === p.base || E < p.min || E > p.max) continue;
    const durOf = (m) => toMin(m.t[1]) - toMin(m.t[0]);
    const nd = spread(p.flex.map((i) => durOf(out[i])), E - p.start - p.fixed); // pauses et bilan gardent leur durée
    const seg = [];
    let t = p.start;
    for (let i = p.a; i <= p.last; i++) {
      const m = out[i], f = p.flex.indexOf(i), d0 = durOf(m), d = f < 0 ? d0 : nd[f];
      const n = { ...m, t: [toHHMM(t), toHHMM(t + d)] };
      // exercice : raccourci avec sa séquence (jamais allongé), 5 minutes au moins
      if (m.exo?.duree && d < d0) n.exo = { ...m.exo, duree: Math.min(m.exo.duree, d, Math.max(5, Math.round((m.exo.duree * d) / d0 / 5) * 5)) };
      seg.push(n); t += d;
    }
    out = [...out.slice(0, p.a), ...seg, ...out.slice(p.last + 1)];
  }
  return out;
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
