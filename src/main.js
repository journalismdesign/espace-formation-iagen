/* Point d'entrée : authentification, routage par ancre (#/…), en-tête. */
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";

import { api } from "./api/index.js";
import { $, esc, toast, dateFr } from "./lib/dom.js";
import { samsaHtml } from "./lib/brand.js";
import { closeSheet } from "./lib/content.js";
import { viewLogin, viewTrainerLogin, viewSetTrainerCode, viewGuestLogin, RESET, GUEST_TRY, GUEST_REFUSED } from "./views/login.js";
import { viewEntry } from "./views/entry.js";
import { viewHome } from "./views/home.js";
import { viewProfile } from "./views/profile.js";
import { viewSession } from "./views/session.js";
import { viewAdmin } from "./views/admin.js";
import { viewAdminSession } from "./views/adminSession.js";
import { viewScreen } from "./views/screen.js";
import { viewStaff } from "./views/staff.js";
import { isAdmin, isGuest, canView } from "./lib/roles.js";
import { viewSettings } from "./views/settings.js";
import { viewTrainers } from "./views/trainers.js";
import { viewQuizBank } from "./views/quizBank.js";
import { viewTrames } from "./views/trames.js";
import { viewParticipants } from "./views/participants.js";
import { MAIN_TABS, mainTabOf, ICON } from "./lib/adminNav.js";
import { initMotion, placeIndicator, enterView, initTabs } from "./lib/motion.js";
import { morph } from "./lib/morph.js";
import { skinFooter, skinForRoute, applySkin, currentSkin } from "./lib/skin.js";

const app = $("#app");
const LOADING = `<div class="tab-loading" role="status">Chargement<span class="dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>`;
let cleanup = null, me = null, booted = false, renderTok = 0, currentRoute = null;

export const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

const ROUTES = [
  [/^#\/login$/, viewLogin, { public: true }],
  [/^#\/formateur$/, viewTrainerLogin, { public: true }],
  [/^#\/formateur\/code$/, viewSetTrainerCode, {}],
  [/^#\/invitation$/, viewGuestLogin, { public: true }], // invité·es : code par e-mail, puis leurs sessions de démo
  [/^#\/join\/([A-Za-z0-9]+)$/, viewEntry, { any: true, bare: true }],
  [/^#\/profil$/, viewProfile],
  [/^#\/s\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?$/, viewSession],
  [/^#\/admin(?:\/(archives))?$/, viewAdmin, { trainer: true }], // sessions à venir, ou archivées
  [/^#\/admin\/reglages(?:\/(\w+))?$/, viewSettings, { trainer: true, admin: true }],
  [/^#\/admin\/formateurs(?:\/([\w-]+))?$/, viewTrainers, { trainer: true, admin: true }],
  [/^#\/admin\/quiz(?:\/([\w-]+))?$/, viewQuizBank, { trainer: true, admin: true }],
  [/^#\/admin\/trames(?:\/([\w-]+))?$/, viewTrames, { trainer: true, admin: true }], // trames de conducteur (éditeur)
  [/^#\/admin\/equipe(?:\/(comptes|fiches))?(?:\/([\w-]+))?$/, viewStaff, { trainer: true, admin: true }],
  [/^#\/admin\/participants(?:\/[\w-]+)*$/, viewParticipants, { trainer: true, admin: true }], // adresses des stagiaires
  [/^#\/admin\/s\/([\w-]+)(?:\/(\w+))?$/, viewAdminSession, { trainer: true }],
  [/^#\/ecran\/([\w-]+)$/, viewScreen, { trainer: true, bare: true }],
  [/^#?\/?$/, viewHome],
];

function header(route) {
  if (route?.bare || !me) return "";
  const trainer = canView(me); // équipe et invité·es : lien vers le back-office
  const h = location.hash;
  const link = (href, label, on) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  // Vue stagiaire d'une session (aperçu formateur) : « Back-office » ramène au Jour J de cette session
  const inSession = h.match(/^#\/s\/([\w-]+)/)?.[1];
  // Équipe (pas les invité·es) : trois onglets principaux sous le bandeau, et l'engrenage des réglages généraux
  const staffNav = trainer && !isGuest(me), mt = staffNav ? mainTabOf(h) : "";
  const mainbar = staffNav ? `<div class="mainbar"><div class="hwrap"><nav class="maintabs" aria-label="Back-office">${MAIN_TABS.filter(([k]) => k === "sessions" || isAdmin(me))
    .map(([k, l, href]) => `<a class="maintab" href="${k === "sessions" && inSession ? `#/admin/s/${inSession}/jour` : href}"${k === mt ? ' aria-current="page"' : ""}>${l}</a>`).join("")}<span class="mt-ind" aria-hidden="true"></span></nav>
    ${isAdmin(me) ? `<a class="iconbtn gear-btn" href="#/admin/reglages" title="Réglages généraux : organisme, habillages, entreprises clientes, e-mail des stagiaires" aria-label="Réglages généraux"${mt === "reglages" ? ' aria-current="page"' : ""}>${ICON.gear}</a>` : ""}</div></div>` : "";
  return `<header class="top"><div class="hwrap">
    <a class="brand-wrap" href="#/">${samsaHtml(true, "head")}<span class="brand"><span class="kicker">Espace formation · ${esc(currentSkin()?.name || "Journalisme & IA")}</span><b>Prendre en main les IA génératives</b></span></a>
    <nav class="topnav">
      ${staffNav ? "" : trainer ? link("#/admin", "Back-office", h.startsWith("#/admin")) : link("#/", "Mon espace", h === "#/" || h === "" || h.startsWith("#/s/"))}
      ${link("#/profil", esc(me.full_name || me.email.split("@")[0]), h === "#/profil")}
      <button class="linkbtn" id="logout">Se déconnecter</button>
    </nav></div>
    ${mainbar}
    ${api.mode === "demo" ? `<div class="demo-band">Mode démonstration : données stockées dans ce navigateur uniquement.${isGuest(me) ? "" : ` <button class="linkbtn" id="demoReset">Réinitialiser</button>`}</div>` : ""}
    ${isGuest(me) ? guestBand(me) : ""}
  </header>`;
}

// Bandeau de l'invité·e : sessions de démonstration, date de fin (ou accès terminé)
function guestBand(me) {
  const until = me.guest_until ? dateFr(me.guest_until, { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ") : "";
  const txt = me.guest_active === false
    ? `Votre accès invité a pris fin${until ? ` le ${until}` : ""}. Demandez à l'équipe de le prolonger.`
    : `Invitation · démonstration${until ? ` jusqu'au ${until}` : ""} : manipulez librement vos deux sessions de démo, aucune vraie session n'est concernée.`;
  return `<div class="guest-band${me.guest_active === false ? " over" : ""}" role="status">${esc(txt)}</div>`;
}

/* Barres d'onglets (.phases) : si la nouvelle page a une barre aux mêmes liens que l'ancienne, l'ancienne est gardée
   (même élément, pastille comprise) ; on n'y reprend que les libellés, pastilles « à régler » et l'onglet actif. */
function keepTabs(oldView, view) {
  if (!oldView) return [];
  const links = (bar) => [...bar.querySelectorAll(":scope > a")];
  const sig = (bar) => links(bar).map((a) => a.getAttribute("href")).join("|");
  const olds = [...oldView.querySelectorAll(".phases")], kept = [];
  view.querySelectorAll(".phases").forEach((nb) => {
    const ob = olds.find((b) => !kept.includes(b) && sig(b) === sig(nb));
    if (!ob) return;
    const oa = links(ob);
    links(nb).forEach((a, i) => {
      if (oa[i].innerHTML !== a.innerHTML) oa[i].innerHTML = a.innerHTML;
      if (a.hasAttribute("aria-current")) oa[i].setAttribute("aria-current", "page"); else oa[i].removeAttribute("aria-current");
    });
    if (nb.getAttribute("style") !== ob.getAttribute("style")) ob.setAttribute("style", nb.getAttribute("style") || "");
    nb.replaceWith(ob);
    kept.push(ob);
  });
  return kept;
}

async function render() {
  const tok = ++renderTok; // un rendu plus récent annule celui-ci
  closeSheet();
  const h = location.hash || "#/";
  let m = null, route = null;
  for (const r of ROUTES) { m = h.match(r[0]); if (m) { route = { view: r[1], ...(r[2] || {}) }; break; } }
  if (!route) { go("#/"); return; }
  // Même vue : elle peut ne redessiner qu'une partie de la page (onglets de l'espace stagiaire : la colonne
  // de gauche reste en place). Elle renvoie false si un rendu complet est nécessaire.
  if (cleanup?.retab && currentRoute?.view === route.view) {
    try { if (await cleanup.retab(m.slice(1))) { if (tok === renderTok) window.scrollTo(0, 0); return; } } catch (e) { console.error(e); }
  }
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  currentRoute = route;

  const user = await api.currentUser();
  if (!user && !route.public && !route.any) { go("#/login"); return; }
  // Connexion par code temporaire (première connexion ou code oublié) : choix du code d'accès
  let resetPending = false; try { resetPending = localStorage.getItem(RESET) === "1"; } catch {}
  if (user && resetPending && h !== "#/formateur/code") { go("#/formateur/code"); return; }
  if (user && route.public) { go("#/"); return; }
  me = user ? await api.me() : null;
  if (tok !== renderTok) return;
  // Connexion par la page d'invitation d'une adresse sans invitation : pas d'espace stagiaire, retour à la page avec un message
  let tried = null; try { tried = sessionStorage.getItem(GUEST_TRY); sessionStorage.removeItem(GUEST_TRY); } catch {}
  if (user && tried && !canView(me)) {
    await api.signOut(); me = null; booted = false;
    try { sessionStorage.setItem(GUEST_REFUSED, tried); } catch {}
    go("#/invitation"); return;
  }
  if (user && !booted) { booted = true; if (!isGuest(me)) { try { await api.claimInvites(); } catch (e) { console.warn(e); } } }
  if (route.trainer && !canView(me)) { go("#/"); return; }
  if (route.admin && !isAdmin(me)) { go("#/admin"); return; } // pages réservées à l'administration
  // Anti-cadre : le back-office et l'écran projeté ne s'affichent pas dans une page tierce (détournement de clics).
  // GitHub Pages ne permet pas l'en-tête frame-ancestors, d'où ce contrôle en JS.
  if (route.trainer && window.top !== window.self) { app.innerHTML = `<main id="view"><div class="card"><h2>Page non disponible ici</h2><p class="muted">Ouvrez le back-office directement dans le navigateur.</p></div></main>`; return; }
  if (tok !== renderTok) return;

  // Habillage du centre de formation (session ouverte, sinon habillage par défaut)
  const skin = await skinForRoute(api, h, user).catch(() => null);
  if (tok !== renderTok) return;
  applySkin(skin);
  document.body.classList.toggle("bare", !!route.bare);
  /* En-tête et barre des onglets gardés en place d'une page à l'autre : morph() ne touche qu'à ce qui change (onglet
     actif, nom, bandeaux), sans rien redessiner ni faire clignoter. Seule la zone utile (#view) est remplacée, par un
     élément neuf : les écouteurs posés par la vue précédente partent avec elle. */
  if (!$("#hdr")) app.innerHTML = `<div id="hdr"></div><main id="view"></main>`;
  morph($("#hdr"), header(route));
  const view = document.createElement("main");
  view.id = "view";
  /* La nouvelle page se dessine hors de l'écran pendant que l'ancienne reste affichée, puis les deux sont échangées d'un
     coup : pas d'écran vide ni d'effet de chargement. Une barre d'onglets identique (mêmes liens) n'est pas redessinée :
     l'ancienne est gardée telle quelle, seul l'onglet actif change (keepTabs), et seuls les modules sous la barre
     apparaissent. Pages plein écran (entrée stagiaire, écran projeté) et premier affichage : comme avant. Page lente
     (plus de 700 ms) : l'échange se fait quand même, avec « Chargement » si elle est encore vide. */
  const oldView = $("#view"), offscreen = !route.bare && !!oldView?.childElementCount;
  let kept = [], swapped = false;
  const swap = () => {
    if (swapped || tok !== renderTok) return;
    swapped = true;
    kept = keepTabs(oldView, view);
    $("#view").replaceWith(view);
    initTabs(view);
  };
  if (!offscreen) swap();
  placeIndicator($(".maintabs")); // le trait glisse de l'onglet précédent au nouveau
  const logout = $("#logout"), demoReset = $("#demoReset"); // onclick (et non addEventListener) : l'en-tête reste, un seul écouteur
  if (logout) logout.onclick = async () => { await api.signOut(); me = null; booted = false; go("#/login"); };
  if (demoReset) demoReset.onclick = () => confirm("Effacer toutes les données de démonstration ?") && api.reset();
  const ctx = { api, me, go, refreshMe: async () => (me = await api.me(true)) };
  ctx.me = me || {};
  const slow = setTimeout(() => { swap(); if (swapped && !view.childElementCount) view.innerHTML = LOADING; }, offscreen ? 700 : 150);
  try {
    cleanup = (await route.view(view, m.slice(1), ctx)) || null;
    swap();
    if (tok === renderTok && !route.bare && (/^#\/admin\b/.test(h) || h === "#/" || h === "")) enterView(view, kept);
  } catch (e) {
    console.error(e);
    swap();
    view.innerHTML = `<div class="card"><h2>Impossible d'afficher cette page</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Retour à mon espace</a></div>`;
  } finally { clearTimeout(slow); }
  if (tok === renderTok && !kept.length) window.scrollTo(0, 0); // même barre d'onglets : on reste où l'on est
}

// Lien court …/CODE6 (serveur de développement, hébergements qui renvoient index.html)
{
  const seg = location.pathname.split("/").pop();
  if (/^[A-Za-z0-9]{6}(?:[A-Za-z0-9]{2})?$/.test(seg) && !location.hash) {
    history.replaceState(null, "", location.pathname.replace(/[^/]*$/, "") + "#/join/" + seg.toUpperCase());
  }
}

// Le parcours d'entrée gère lui-même la connexion : pas de rendu forcé pendant celui-ci
// Supabase réémet un événement de connexion quand l'onglet reprend le focus (rafraîchissement du jeton) :
// on ne redessine la page que si l'utilisateur·ice a réellement changé, sinon la saisie en cours serait perdue.
let authUid;
api.onAuthChange((u) => {
  const uid = u?.id || null;
  if (uid === authUid) return;
  authUid = uid;
  if (!u) { me = null; booted = false; }
  if (u && currentRoute?.any) return;
  render();
});
window.addEventListener("hashchange", render);
initMotion(); // animations des boutons et onglets (GSAP, src/lib/motion.js)
render();
