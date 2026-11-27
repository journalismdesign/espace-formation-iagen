/* Navigation du pilotage, sans dépendance au navigateur (testée dans tests/programme.test.mjs) : pages du
   support d'une séquence, séquence voisine, activités placées dans le déroulé, page suivante pour « À suivre ».
   Utilisée par le pilotage, l'écran projeté et ses flèches (screen.js la réexporte). */
import { modulesFor, actsByModule, actPlace } from "./content.js";
import { quizFor } from "./quizzes.js";
import { slideEmbedUrl, deckEmbedUrl, deckKind, parsePages } from "../deck.js";

/* Pages masquées du support (sessions.skip_pages, ex. « 12, 40 à 45 ») : Google Slides affiche une slide
   masquée quand on l'appelle, le pilotage les saute donc lui-même. */
export const skipSet = (session) => new Set(parsePages(session?.skip_pages));
// Pages d'une séquence, sans les pages masquées
export const modPages = (session, mod) => { const s = skipSet(session); return mod ? parsePages(mod.pages).filter((p) => !s.has(p)) : []; };
// Page ±1 hors liste, par-dessus les pages masquées (null avant la page 1)
function freeStep(session, p, dir) {
  const s = skipSet(session); let n = (p || 1) + dir;
  while (n >= 1 && s.has(n)) n += dir;
  return n >= 1 ? n : null;
}

// Séquence voisine dans le déroulé, sans changer de journée
function neighbourModule(session, mod, dir) {
  const mods = modulesFor(session), n = mods[mods.findIndex((m) => m.id === mod.id) + dir];
  return n && (n.day || 1) === (mod.day || 1) ? n : null;
}
// Activités placées dans une séquence que les flèches enchaînent (le vote attend ses options : bouton du pilotage)
const stepActs = (session, modId) => (actsByModule(session).get(modId) || []).filter((a) => a.type !== "vote");
// État « live » sans l'activité (on quitte une activité pour une page ou l'écran d'une séquence)
const noAct = ({ act, qi, reveal, options, ...rest }) => rest;
// Lancer une activité placée, comme le bouton du pilotage (première question d'un quiz)
const enterAct = (live, a, modId, now) => ({ ...noAct(live), module: modId, view: "activity", act: a.id, qi: 0, reveal: false, started_at: now });
// Entrer dans une séquence au clavier : sa première page (sa dernière en reculant), ou son écran si elle n'a pas de pages.
// En reculant, on arrive sur sa dernière activité placée s'il y en a une. Son outil d'exercice est débloqué,
// comme quand on la lance depuis le pilotage.
function enterModule(session, live, m, dir, now) {
  const pages = session.slides_url ? modPages(session, m) : [];
  const tools = m.outil ? [...new Set([...(live.tools || []), m.outil])] : live.tools;
  const acts = dir < 0 ? stepActs(session, m.id) : [];
  if (acts.length) return enterAct({ ...live, ...(tools ? { tools } : {}) }, acts[acts.length - 1], m.id, now);
  const base = { ...noAct(live), module: m.id, started_at: now, ...(tools ? { tools } : {}) };
  return pages.length ? { ...base, view: "slide", slide: dir > 0 ? pages[0] : pages[pages.length - 1] } : { ...base, view: "module" };
}
// Flèches sur une activité placée : questions d'un quiz, puis activité voisine de la séquence ; au bout, séquence
// suivante (ou retour à la dernière page de la séquence en reculant). Activité hors déroulé : rien.
function stepAct(session, live, dir, now) {
  const a = (session.activities || []).find((x) => x.id === live.act);
  const mid = actPlace(session, a);
  if (!a || !mid) return null;
  if (a.type === "quiz") {
    const n = quizFor(session, a.quiz)?.questions.length || 1, qi = (live.qi || 0) + dir;
    if (qi >= 0 && qi < n) return { ...live, qi, reveal: false, started_at: now };
  }
  const list = stepActs(session, mid), k = list.findIndex((x) => x.id === a.id) + dir, m = modulesFor(session).find((x) => x.id === mid);
  if (k >= 0 && k < list.length) return enterAct(live, list[k], mid, now);
  if (dir < 0) {
    const pages = session.slides_url ? modPages(session, m) : [];
    return { ...noAct(live), module: mid, started_at: now, ...(pages.length ? { view: "slide", slide: pages[pages.length - 1] } : { view: "module" }) };
  }
  const n = neighbourModule(session, m, 1);
  return n ? enterModule(session, live, n, 1, now) : null;
}

/* Avancer ou reculer d'une page (flèches du clavier, télécommande, boutons ← →) : nouvel état « live » ou null.
   Page du support : pages de la séquence (ou ±1 hors liste) ; arrivé au bout, on passe à la séquence
   voisine de la même journée (première page, ou dernière en reculant) ; séquence → sa première page ;
   présentation Google Slides : page ±1. Les activités placées dans une séquence (pilotage) s'intercalent après
   ses pages : chaque question d'un quiz, puis l'activité suivante, puis la séquence suivante. */
export function stepLive(session, dir) {
  const live = session.live || {}, now = new Date().toISOString();
  if (live.view === "activity" && live.act) return stepAct(session, live, dir, now);
  const mod = live.module ? modulesFor(session).find((m) => m.id === live.module) : null;
  const pages = mod && session.slides_url ? modPages(session, mod) : [];
  // page projetée hors de la liste de la séquence : on avance page par page (en sautant les pages masquées)
  if (live.view === "slide" && pages.length && !pages.includes(live.slide)) { const p = freeStep(session, live.slide, dir); return p ? { ...live, slide: p, started_at: now } : null; }
  if (mod && (live.view === "module" || (live.view === "slide" && pages.length))) {
    const j = live.view === "slide" ? pages.indexOf(live.slide) + dir : -1;
    if (j >= 0 && j < pages.length) return { ...live, view: "slide", slide: pages[j], started_at: now };
    if (live.view === "module" && dir > 0 && pages.length) return { ...live, view: "slide", slide: pages[0], started_at: now };
    const acts = dir > 0 ? stepActs(session, mod.id) : [];
    if (acts.length) return enterAct(live, acts[0], mod.id, now);
    const n = neighbourModule(session, mod, dir);
    return n ? enterModule(session, live, n, dir, now) : null;
  }
  if (live.view === "slide" && session.slides_url) { const p = freeStep(session, live.slide, dir); return p ? { ...live, slide: p, started_at: now } : null; }
  if (live.view === "deck") {
    const d = (session.decks || []).find((x) => x.id === live.deck);
    if (d && deckKind(d.url) === "slides") { const p = Math.max(1, (live.page || 1) + dir); return p === (live.page || 1) ? null : { ...live, page: p, started_at: now }; }
  }
  return null;
}
// Touches de pilotage : flèches, Page suivante/précédente (télécommandes de présentation), espace
export function pageKey(e) {
  const t = e.target, tag = t?.tagName;
  if (e.altKey || e.ctrlKey || e.metaKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return 0;
  if (["ArrowRight", "PageDown", "ArrowDown"].includes(e.key)) return 1;
  if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) return -1;
  return 0;
}

/* Ce qu'afficherait la flèche droite : { src, label } ou null (src vide pour l'écran d'une séquence sans pages).
   Même règle que stepLive, séquence suivante comprise. */
export function nextPage(session) {
  const live = session.live || {}, nl = stepLive(session, 1);
  if (!nl) return null;
  const m = nl.module !== live.module ? modulesFor(session).find((x) => x.id === nl.module) : null;
  const seq = m ? `Séquence suivante : ${m.titre}` : "";
  if (nl.view === "activity") {
    const a = (session.activities || []).find((x) => x.id === nl.act);
    if (!a) return null;
    const n = a.type === "quiz" ? quizFor(session, a.quiz)?.questions.length || 0 : 0;
    const what = nl.act === live.act && live.view === "activity" ? `question ${(nl.qi || 0) + 1} sur ${n}` : `${a.titre}${n > 1 ? ` · question 1 sur ${n}` : ""}`;
    return { src: null, label: [seq, `Activité : ${what}`].filter(Boolean).join(" · ") };
  }
  if (nl.view === "slide") return { src: slideEmbedUrl(session.slides_url, nl.slide), label: [seq, `page ${nl.slide} du support`].filter(Boolean).join(" · ").replace(/^p/, "P") };
  if (nl.view === "module") return { src: null, label: seq || "Écran de la séquence" };
  if (nl.view === "deck") {
    const d = (session.decks || []).find((x) => x.id === nl.deck);
    if (d) return { src: deckEmbedUrl(d.url, nl.page), label: `${d.title} · page ${nl.page}` };
  }
  return null;
}

