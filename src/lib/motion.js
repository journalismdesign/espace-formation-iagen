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
const PRESS = ".btn, .iconbtn, .chip, .maintab, .phases a, .linkbtn, .side-em";
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
  window.addEventListener("resize", () => placeIndicator(document.querySelector(".maintabs"), false));
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

// Entrée d'une page : les blocs, puis les lignes des tableaux (une soixantaine au plus)
export function enterView(root) {
  if (!root || reduce()) return;
  const blocks = [...root.children].filter((el) => el.offsetParent !== null).slice(0, 14);
  if (blocks.length) gsap.fromTo(blocks, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.04, clearProps: "opacity,transform" });
  const rows = root.querySelectorAll(".tbl tbody tr");
  if (rows.length && rows.length <= 60) gsap.fromTo(rows, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.26, ease: "power1.out", stagger: 0.018, delay: 0.1, clearProps: "opacity,transform" });
}

// Changement d'état d'une case (feuille d'émargement…)
export function pop(el) {
  if (!el || reduce()) return;
  gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.4, ease: "back.out(3)", clearProps: "transform" });
}
