/* Point d'entrée : authentification, routage par ancre (#/…), en-tête. */
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";

import { api } from "./api/index.js";
import { $, esc, toast } from "./lib/dom.js";
import { closeSheet } from "./lib/content.js";
import { viewLogin } from "./views/login.js";
import { viewHome } from "./views/home.js";
import { viewProfile } from "./views/profile.js";
import { viewSession } from "./views/session.js";
import { viewAdmin } from "./views/admin.js";
import { viewAdminSession } from "./views/adminSession.js";
import { viewScreen } from "./views/screen.js";

const JOIN_KEY = "iagen-join-code";
const app = $("#app");
let cleanup = null, me = null, booted = false, renderTok = 0;

export const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

const ROUTES = [
  [/^#\/login$/, viewLogin, { public: true }],
  [/^#\/join\/([A-Za-z0-9]+)$/, null, { join: true }],
  [/^#\/profil$/, viewProfile],
  [/^#\/s\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?$/, viewSession],
  [/^#\/admin$/, viewAdmin, { trainer: true }],
  [/^#\/admin\/s\/([\w-]+)(?:\/(\w+))?$/, viewAdminSession, { trainer: true }],
  [/^#\/ecran\/([\w-]+)$/, viewScreen, { trainer: true, bare: true }],
  [/^#?\/?$/, viewHome],
];

function header(route) {
  if (route?.bare || !me) return "";
  const trainer = me.role === "trainer";
  const h = location.hash;
  const link = (href, label, on) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="top"><div class="hwrap">
    <a class="brand" href="#/"><span class="kicker">Espace formation · Journalisme &amp; IA</span><b>Prendre en main les IA génératives</b></a>
    <nav class="topnav">
      ${trainer ? link("#/admin", "Back-office", h.startsWith("#/admin")) : link("#/", "Mon espace", h === "#/" || h === "" || h.startsWith("#/s/"))}
      ${link("#/profil", esc(me.full_name || me.email.split("@")[0]), h === "#/profil")}
      <button class="linkbtn" id="logout">Se déconnecter</button>
    </nav></div>
    ${api.mode === "demo" ? `<div class="demo-band">Mode démonstration : données stockées dans ce navigateur uniquement. <button class="linkbtn" id="demoReset">Réinitialiser</button></div>` : ""}
  </header>`;
}

async function render() {
  const tok = ++renderTok; // un rendu plus récent annule celui-ci
  closeSheet();
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const h = location.hash || "#/";
  let m = null, route = null;
  for (const r of ROUTES) { m = h.match(r[0]); if (m) { route = { view: r[1], ...(r[2] || {}) }; break; } }
  if (!route) { go("#/"); return; }

  const user = await api.currentUser();
  if (route.join) {
    localStorage.setItem(JOIN_KEY, m[1].toUpperCase());
    if (!user) { go("#/login"); return; }
    return afterLogin(true);
  }
  if (!user && !route.public) { go("#/login"); return; }
  if (user && route.public) { go("#/"); return; }
  me = user ? await api.me() : null;
  if (tok !== renderTok) return;
  if (user && !booted) { booted = true; await afterLogin(false); if (location.hash !== h) return; }
  if (route.trainer && me?.role !== "trainer") { go("#/"); return; }
  if (tok !== renderTok) return;

  document.body.classList.toggle("bare", !!route.bare);
  app.innerHTML = header(route) + `<main id="view"></main>`;
  $("#logout")?.addEventListener("click", async () => { await api.signOut(); me = null; booted = false; go("#/login"); });
  $("#demoReset")?.addEventListener("click", () => confirm("Effacer toutes les données de démonstration ?") && api.reset());
  const ctx = { api, me, go, refreshMe: async () => (me = await api.me(true)) };
  try {
    cleanup = (await route.view($("#view"), m.slice(1), ctx)) || null;
  } catch (e) {
    console.error(e);
    $("#view").innerHTML = `<div class="card"><h2>Impossible d'afficher cette page</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Retour à mon espace</a></div>`;
  }
  window.scrollTo(0, 0);
}

// Après connexion : rattacher les invitations, puis rejoindre le code en attente
async function afterLogin(forceRoute) {
  try { await api.claimInvites(); } catch (e) { console.warn(e); }
  const code = localStorage.getItem(JOIN_KEY);
  if (code) {
    localStorage.removeItem(JOIN_KEY);
    try { const sid = await api.joinSession(code); toast("Session rejointe.", "ok"); go(`#/s/${sid}`); return; }
    catch (e) { toast(e.message, "ko"); }
  }
  if (forceRoute) go("#/");
}

api.onAuthChange((u) => { if (!u) { me = null; booted = false; } render(); });
window.addEventListener("hashchange", render);
render();
