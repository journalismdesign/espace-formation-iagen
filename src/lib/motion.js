/* Animations des éléments d'interaction, avec GSAP :
   - boutons, puces, onglets et l'engrenage : léger soulèvement au survol, enfoncement à l'appui, rebond au relâché ;
   - barre des onglets principaux : le trait de l'onglet actif glisse de l'ancien onglet au nouveau ;
   - pages du back-office : entrée en fondu (blocs, puis lignes des tableaux) ;
   - toasts : arrivée avec un petit rebond ; cases de la feuille d'émargement : « pop » au changement d'état.
   Transformations et opacité seulement, courtes. Rien sur l'écran projeté ni sur l'écran de la carte « En direct »,
   rien quand le système demande moins d'animations (prefers-reduced-motion), pas de survol au doigt. */
import { gsap } from "gsap";
import { hooks } from "./dom.js";

const reduce = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const PRESS = ".btn, .iconbtn, .chip, .linkbtn, .side-em, .room-btn"; // onglets : pastille et trait qui glissent (initTabs, slideIndicator)
const LIFT = -1.5;
let hovered = null, started = false, lastInd = null;

const pressable = (e) => {
  const el = e.target?.closest?.(PRESS);
  return el && !el.disabled && !el.closest(".screen, .ds-wrap, .scr-wrap, [data-nomotion]") ? el : null;
};
const leave = (el) => gsap.to(el, { y: 0, scale: 1, duration: 0.22, ease: "power2.out", overwrite: "auto", clearProps: "transform" });

export function initMotion() {
  if (started || typeof document === "undefined") return;
  started = true;
  document.documentElement.classList.add("gsap-on");
  document.addEventListener("pointerover", (e) => {
    if (reduce() || e.pointerType === "touch") return;
    const el = pressable(e);
    if (!el || el === hovered) return;
    if (hovered) leave(hovered);
    hovered = el;
    gsap.to(el, { y: LIFT, duration: 0.18, ease: "power2.out", overwrite: "auto" });
  });
  document.addEventListener("pointerout", (e) => {
    if (!hovered || (e.relatedTarget && hovered.contains(e.relatedTarget))) return;
    leave(hovered); hovered = null;
  });
  document.addEventListener("pointerdown", (e) => {
    if (reduce()) return;
    const el = pressable(e);
    if (el) gsap.to(el, { scale: 0.94, y: 0, duration: 0.08, ease: "power2.out", overwrite: "auto" });
  });
  const release = (e) => {
    if (reduce()) return;
    const el = pressable(e);
    if (!el) return;
    gsap.to(el, { scale: 1, y: el === hovered ? LIFT : 0, duration: 0.5, ease: "back.out(4)", overwrite: "auto",
      ...(el === hovered ? {} : { clearProps: "transform" }) });
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  hooks.toast = (el) => { if (!reduce()) gsap.from(el, { y: 16, opacity: 0, scale: 0.96, duration: 0.4, ease: "back.out(2)" }); };
window.addEventListener("resize", () => { placeIndicator(document.querySelector(".maintabs"), false); document.querySelectorAll(".phases.ph-on").forEach((b) => movePill(b, current(b), false)); });
// Onglets principaux : le trait jaune glisse sous l'onglet survolé, puis revient sur l'onglet actif
document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return;
  const t = e.target.closest?.(".maintab"); if (t) slideIndicator(t.closest(".maintabs"), t);
});
document.addEventListener("pointerout", (e) => {
  const nav = e.target.closest?.(".maintabs");
  if (nav && !(e.relatedTarget && nav.contains(e.relatedTarget))) slideIndicator(nav, nav.querySelector('.maintab[aria-current="page"]'));
});
}

// Trait sous l'onglet principal actif : il part de la position de l'onglet précédent
export function placeIndicator(nav, animate = true) {
  const ind = nav?.querySelector(".mt-ind"), cur = nav?.querySelector('.maintab[aria-current="page"]');
  if (!ind) return;
  if (!cur) { gsap.set(ind, { opacity: 0 }); lastInd = null; return; }
  const to = { x: cur.offsetLeft, y: cur.offsetTop + cur.offsetHeight - 3, width: cur.offsetWidth };
  if (animate && lastInd && !reduce() && (lastInd.x !== to.x || lastInd.y !== to.y || lastInd.width !== to.width)) {
    gsap.fromTo(ind, { ...lastInd, opacity: 1 }, { ...to, duration: 0.5, ease: "power3.out" });
  } else gsap.set(ind, { ...to, opacity: 1 });
  lastInd = to;
}

// Entrée d'une page : les blocs, puis les lignes des tableaux (une soixantaine au plus). Barre d'onglets gardée (kept) :
// seuls les blocs sous la barre entrent, l'en-tête et les onglets ne bougent pas.
export function enterView(root, kept = []) {
  if (!root || reduce()) return;
  let kids = [...root.children];
  if (kept.length) { const top = (el) => { while (el && el.parentElement !== root) el = el.parentElement; return el; }; const i = Math.max(...kept.map((b) => kids.indexOf(top(b)))); kids = kids.slice(i + 1); }
  const blocks = kids.filter((el) => el.offsetParent !== null).slice(0, 14);
  if (blocks.length) gsap.fromTo(blocks, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.04, clearProps: "opacity,transform" });
  const rows = kept.length ? [] : root.querySelectorAll(".tbl tbody tr");
  if (rows.length && rows.length <= 60) gsap.fromTo(rows, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.26, ease: "power1.out", stagger: 0.018, delay: 0.1, clearProps: "opacity,transform" });
}

// Changement d'état d'une case (feuille d'émargement…)
export function pop(el) {
  if (!el || reduce()) return;
  gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.4, ease: "back.out(3)", clearProps: "transform" });
}

// Ouverture d'une fenêtre par-dessus la page (visionneuse des slides…) : fond en fondu, carte qui se pose
export function popIn(card, backdrop) {
  if (!card || reduce()) return;
  if (backdrop) gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out", clearProps: "opacity" });
  gsap.fromTo(card, { opacity: 0, scale: 0.96, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: "power3.out", clearProps: "opacity,transform" });
}

// Trait des onglets principaux vers un onglet (survol), sans changer l'onglet actif retenu par placeIndicator
function slideIndicator(nav, tab) {
  const ind = nav?.querySelector(".mt-ind");
  if (!ind || !tab || reduce()) return;
  gsap.to(ind, { x: tab.offsetLeft, y: tab.offsetTop + tab.offsetHeight - 3, width: tab.offsetWidth, opacity: 1, duration: 0.35, ease: "power3.out", overwrite: "auto" });
}

/* Barres d'onglets (.phases) : une pastille blanche, derrière les liens, glisse sous l'onglet survolé ou choisi au
   clavier, et revient sur l'onglet actif quand le pointeur s'en va. À la navigation, la barre est gardée (keepTabs,
   main.js) : la pastille reste sous l'onglet cliqué, devenu l'onglet actif. Sans GSAP actif, le style CSS habituel. */
const current = (bar) => bar.querySelector(':scope > a[aria-current="page"]');
function movePill(bar, a, animate) {
  const pill = bar._pill;
  if (!pill) return;
  if (!a) { gsap.to(pill, { opacity: 0, duration: 0.15, overwrite: "auto" }); return; }
  const to = { x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight, opacity: 1 };
  if (animate && pill._placed && !reduce()) gsap.to(pill, { ...to, duration: 0.35, ease: "power3.out", overwrite: "auto" });
  else gsap.set(pill, to);
  pill._placed = true;
}
export function initTabs(root = document) {
  root.querySelectorAll(".phases").forEach((bar) => {
    if (bar._pill) { movePill(bar, current(bar), true); return; }
    const pill = document.createElement("span");
    pill.className = "ph-pill"; pill.setAttribute("aria-hidden", "true");
    bar.prepend(pill); bar._pill = pill; bar.classList.add("ph-on");
    bar.addEventListener("pointerover", (e) => { const a = e.target.closest("a"); if (a && e.pointerType !== "touch") movePill(bar, a, true); });
    bar.addEventListener("pointerleave", () => movePill(bar, current(bar), true));
    bar.addEventListener("focusin", (e) => { const a = e.target.closest("a"); if (a) movePill(bar, a, true); });
    bar.addEventListener("focusout", (e) => { if (!bar.contains(e.relatedTarget)) movePill(bar, current(bar), true); });
    movePill(bar, current(bar), false);
  });
}
