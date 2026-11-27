/* Trames de conducteur : le modèle de l'éditeur (pur, testé dans tests/trame.test.mjs).
   Une trame se range comme un déroulé (sessions.programme : {formation, days, nDays, modules}), plus le lien du
   support (slides_url, slides_n) et, pour chaque séquence, les quiz et sondages joués en salle (acts : clés de la
   bibliothèque). L'éditeur la manipule sous une forme plus commode :
     { formation, slides_url, slides_n, days: [{ titre, start, lunch: { at, dur }, am: [séquence], pm: [séquence] }] }
   Chaque journée : émargement à l'heure de début, la matinée, le déjeuner (heure modifiable, 12 h 30 par défaut),
   l'émargement de l'après-midi à la fin du déjeuner, l'après-midi, puis la fin de la journée (ou de la formation).
   Ces temps forts restent fixes ; les séquences et les pauses se glissent entre eux, et leurs horaires se
   recalculent en cascade à partir de leurs durées. */
export const MAX_DAYS = 5;
export const DEFAULT_START = "09:30";
export const DEFAULT_LUNCH = { at: "12:30", dur: 60 };
const STEP = 5;

export const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const isLunch = (m) => m?.type === "pause" && /jeuner/i.test(m.titre || "");
const clampDur = (n) => Math.max(STEP, Math.min(8 * 60, Math.round((Number(n) || STEP) / STEP) * STEP));
const rid = () => "t-" + Math.random().toString(36).slice(2, 8);

// Nouvelles séquences, par type
export const BLOCKS = {
  comprendre: { type: "comprendre", titre: "Nouvelle séquence", dur: 30 },
  pratique: { type: "pratique", titre: "Atelier", dur: 45 },
  discussion: { type: "discussion", titre: "Discussion", dur: 15 },
  pause: { type: "pause", titre: "Pause", dur: 15 },
};

export const blankDay = (titre = "") => ({ titre, start: DEFAULT_START, lunch: { ...DEFAULT_LUNCH }, am: [], pm: [] });
export const blankTrame = (formation = "") => ({ formation, slides_url: "", slides_n: 0, days: [blankDay()] });

/* Déroulé → modèle. Le déjeuner (titre « Déjeuner ») sépare matinée et après-midi ; s'il manque, il est ajouté à
   12 h 30 et les séquences qui commencent avant passent le matin. */
export function fromProgramme(p = {}) {
  const mods = (p.modules || []).filter(Boolean);
  const n = Math.min(MAX_DAYS, Math.max(1, p.nDays || 1, ...mods.map((m) => m.day || 1)));
  const days = Array.from({ length: n }, (_, i) => {
    const d = i + 1, dm = mods.filter((m) => (m.day || 1) === d);
    const lunchM = dm.find(isLunch);
    const lunch = lunchM ? { at: lunchM.t[0], dur: clampDur(toMin(lunchM.t[1]) - toMin(lunchM.t[0])) } : { ...DEFAULT_LUNCH };
    const items = dm.filter((m) => m !== lunchM).map(({ day: _d, t, live, acts, ...m }) => ({ ...m, ...((acts || live) ? { acts: acts || [live] } : {}), id: m.id || rid(), dur: clampDur(toMin(t[1]) - toMin(t[0])), _at: t[0] }));
    const cut = toMin(lunch.at);
    const strip = ({ _at, ...m }) => m;
    return {
      titre: (p.days && (p.days[d] || p.days[String(d)])) || "",
      start: dm[0]?.t?.[0] && !isLunch(dm[0]) ? dm[0].t[0] : DEFAULT_START,
      lunch,
      am: items.filter((m) => toMin(m._at) < cut).map(strip),
      pm: items.filter((m) => toMin(m._at) >= cut).map(strip),
    };
  });
  return { formation: p.formation || "", slides_url: p.slides_url || "", slides_n: Number(p.slides_n) || 0, days };
}

// Horaires d'une journée : matinée depuis le début, après-midi depuis la fin du déjeuner
export function timeline(day) {
  let t = toMin(day.start);
  const am = day.am.map((m) => { const a = t; t += m.dur; return { ...m, t: [fromMin(a), fromMin(t)] }; });
  const amEnd = t, lunchA = toMin(day.lunch.at), lunchB = lunchA + day.lunch.dur;
  t = lunchB;
  const pm = day.pm.map((m) => { const a = t; t += m.dur; return { ...m, t: [fromMin(a), fromMin(t)] }; });
  return {
    am, pm,
    lunch: { t: [fromMin(lunchA), fromMin(lunchB)] },
    emargements: [day.start, fromMin(lunchB)],
    end: fromMin(pm.length ? t : lunchB),
    overflow: Math.max(0, amEnd - lunchA), // minutes de matinée qui débordent sur le déjeuner
    early: Math.max(0, lunchA - Math.max(amEnd, toMin(day.start)) ) // temps libre avant le déjeuner
  };
}

// Modèle → déroulé (identifiants uniques et stables, déjeuner rangé à sa place)
export function toProgramme(model) {
  const seen = new Set(), modules = [];
  model.days.forEach((day, i) => {
    const d = i + 1, tl = timeline(day);
    const put = ({ dur: _dur, acts, ...m }) => {
      let id = m.id || rid(); while (seen.has(id)) id = rid(); seen.add(id);
      const out = { ...m, id, day: d, ...(acts?.length ? { live: acts[0], ...(acts.length > 1 ? { acts } : {}) } : {}) };
      Object.keys(out).forEach((k) => (out[k] === undefined || out[k] === "" || (Array.isArray(out[k]) && !out[k].length)) && k !== "titre" && delete out[k]);
      modules.push(out);
    };
    tl.am.forEach(put);
    put({ id: `d${d}-dejeuner`, type: "pause", titre: "Déjeuner", t: tl.lunch.t });
    tl.pm.forEach(put);
  });
  const days = {};
  model.days.forEach((day, i) => { if (day.titre) days[i + 1] = day.titre; });
  return { formation: model.formation || "", days, nDays: model.days.length, modules,
    ...(model.slides_url ? { slides_url: model.slides_url } : {}), ...(model.slides_n ? { slides_n: model.slides_n } : {}) };
}

/* ---------- Gestes de l'éditeur (renvoient un nouveau modèle, l'ancien n'est pas touché) ---------- */
const clone = (m) => JSON.parse(JSON.stringify(m));
export function find(model, id) {
  for (let d = 0; d < model.days.length; d++) for (const half of ["am", "pm"]) {
    const i = model.days[d][half].findIndex((m) => m.id === id);
    if (i >= 0) return { d, half, i, item: model.days[d][half][i] };
  }
  return null;
}
// Déplacer une séquence : vers la journée d (0…), la demi-journée half (am | pm), à la place index
export function moveItem(model, id, to) {
  const m = clone(model), at = find(m, id); if (!at) return model;
  const [item] = m.days[at.d][at.half].splice(at.i, 1);
  const list = m.days[to.d]?.[to.half]; if (!list) return model;
  let idx = Math.max(0, Math.min(to.index ?? list.length, list.length));
  if (at.d === to.d && at.half === to.half && at.i < (to.index ?? list.length)) idx = Math.max(0, idx - 1); // l'élément quitte sa place avant d'être inséré
  list.splice(idx, 0, item);
  return m;
}
export function addItem(model, kind, to, extra = {}) {
  const m = clone(model), list = m.days[to.d]?.[to.half]; if (!list) return { model, id: null };
  const ids = new Set(m.days.flatMap((x) => [...x.am, ...x.pm].map((y) => y.id)));
  let id = rid(); while (ids.has(id)) id = rid();
  const item = { ...clone(BLOCKS[kind] || BLOCKS.comprendre), ...extra, id };
  list.splice(Math.max(0, Math.min(to.index ?? list.length, list.length)), 0, item);
  return { model: m, id };
}
export function updateItem(model, id, patch) {
  const m = clone(model), at = find(m, id); if (!at) return model;
  const next = { ...at.item, ...patch };
  if ("dur" in patch) next.dur = clampDur(patch.dur);
  m.days[at.d][at.half][at.i] = next;
  return m;
}
export function removeItem(model, id) {
  const m = clone(model), at = find(m, id); if (!at) return model;
  m.days[at.d][at.half].splice(at.i, 1);
  return m;
}
export function duplicateItem(model, id) {
  const at = find(model, id); if (!at) return { model, id: null };
  const { id: _id, ...rest } = clone(at.item);
  return addItem(model, rest.type === "pause" ? "pause" : "comprendre", { d: at.d, half: at.half, index: at.i + 1 }, { ...rest, titre: rest.type === "pause" ? rest.titre : `${rest.titre} (copie)` });
}
export function updateDay(model, d, patch) {
  const m = clone(model); if (!m.days[d]) return model;
  const day = m.days[d];
  if ("titre" in patch) day.titre = String(patch.titre || "").slice(0, 120);
  if (patch.start && /^\d{1,2}:\d{2}$/.test(patch.start)) day.start = fromMin(toMin(patch.start));
  if (patch.lunchAt && /^\d{1,2}:\d{2}$/.test(patch.lunchAt)) day.lunch.at = fromMin(toMin(patch.lunchAt));
  if ("lunchDur" in patch) day.lunch.dur = clampDur(patch.lunchDur);
  return m;
}
export function addDay(model) {
  if (model.days.length >= MAX_DAYS) return model;
  const m = clone(model), prev = m.days.at(-1);
  m.days.push({ ...blankDay(), start: prev?.start || DEFAULT_START, lunch: { ...(prev?.lunch || DEFAULT_LUNCH) } });
  return m;
}
export function removeDay(model, d) {
  if (model.days.length <= 1 || !model.days[d]) return model;
  const m = clone(model); m.days.splice(d, 1); return m;
}

/* ---------- Slides ---------- */
// « 11 à 16, 18 » ↔ [11…16, 18] : voir parsePages / formatPages (src/deck.js)
// Pages déjà assignées : page → séquences qui la projettent
export function pagesUsage(model, parse) {
  const use = new Map();
  model.days.forEach((day) => [...day.am, ...day.pm].forEach((m) => parse(m.pages).forEach((p) => use.set(p, [...(use.get(p) || []), m.id]))));
  return use;
}

/* ---------- Quiz et sondages joués en salle ---------- */
// Clés citées par la trame (acts de chaque séquence, et quiz en autonomie)
export function trameKeys(model) {
  const acts = new Set(), quizzes = new Set();
  model.days.forEach((day) => [...day.am, ...day.pm].forEach((m) => { (m.acts || []).forEach((k) => acts.add(k)); if (m.quiz) quizzes.add(m.quiz); }));
  return { acts: [...acts], quizzes: [...quizzes] };
}
