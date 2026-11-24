/* Petits utilitaires d'affichage, sans dépendance. */

// Typographie française : espace insécable avant : ; ? ! » % et après «
export const NB = " ";
export const fr = (s) => String(s ?? "").replace(/ ([:;?!»%])/g, NB + "$1").replace(/« /g, "«" + NB);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const T = (s) => esc(fr(s));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const matches = (q, ...fields) => {
  if (!q) return true;
  const n = norm(fields.join(" "));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => n.includes(w));
};

export const mins = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const hfr = (s) => s.replace(":", " h ").replace(/^0/, "");
export const fmtMin = (n) => { const h = Math.floor(n / 60), m = n % 60; return h ? (m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`) : `${m} min`; };

export function dateFr(d, opts = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
  if (!d) return "Date à fixer";
  try { return new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR", opts); } catch { return d; }
}

export function debounce(fn, ms = 700) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function copyText(txt, btn) {
  try {
    await navigator.clipboard.writeText(txt);
    if (btn) { const o = btn.textContent; btn.textContent = "Copié"; setTimeout(() => (btn.textContent = o), 1400); }
  } catch { if (btn) btn.textContent = "Sélectionnez et copiez à la main"; }
}
export function bindCopy(root) {
  $$("[data-copy]", root).forEach((b) => (b.onclick = () => copyText($("#" + b.dataset.copy).textContent, b)));
}

// Message bref en bas d'écran
export function toast(msg, kind = "") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const d = document.createElement("div");
  d.className = "toast " + kind; d.textContent = fr(msg);
  box.appendChild(d);
  setTimeout(() => d.classList.add("out"), 3200);
  setTimeout(() => d.remove(), 3700);
}

// Exécute une action asynchrone en affichant l'erreur éventuelle
export async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg, "ok"); return r; }
  catch (e) { console.warn(e); toast(e?.message || "Une erreur est survenue.", "ko"); return undefined; }
}

export function download(name, text, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
