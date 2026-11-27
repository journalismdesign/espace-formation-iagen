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
import { readOnlyApi } from "./api/readonly.js";
import { freezeControls } from "./lib/freeze.js";
import { samsaHtml } from "./lib/brand.js";
import { closeSheet } from "./lib/content.js";
import { viewLogin, viewTrainerLogin, viewSetTrainerCode, viewGuestLogin, RESET } from "./views/login.js";
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
import { skinFooter, skinForRoute, applySkin, currentSkin } from "./lib/skin.js";

const app = $("#app");
let cleanup = null, me = null, booted = false, renderTok = 0, currentRoute = null, unfreeze = null;

export const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

const ROUTES = [
  [/^#\/login$/, viewLogin, { public: true }],
  [/^#\/formateur$/, viewTrainerLogin, { public: true }],
  [/^#\/formateur\/code$/, viewSetTrainerCode, {}],
  [/^#\/invitation$/, viewGuestLogin, { public: true }], // invité·es : lien de connexion, lecture seule
  [/^#\/join\/([A-Za-z0-9]+)$/, viewEntry, { any: true, bare: true }],
  [/^#\/profil$/, viewProfile],
  [/^#\/s\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?$/, viewSession],
  [/^#\/admin(?:\/(archives))?$/, viewAdmin, { trainer: true }], // sessions à venir, ou archivées
  [/^#\/admin\/reglages(?:\/(\w+))?$/, viewSettings, { trainer: true, admin: true }],
  [/^#\/admin\/formateurs(?:\/([\w-]+))?$/, viewTrainers, { trainer: true, admin: true }],
  [/^#\/admin\/quiz(?:\/([\w-]+))?$/, viewQuizBank, { trainer: true, admin: true }],
  [/^#\/admin\/equipe(?:\/(comptes|fiches))?(?:\/([\w-]+))?$/, viewStaff, { trainer: true, admin: true }],
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
  return `<header class="top"><div class="hwrap">
    <a class="brand-wrap" href="#/">${samsaHtml(true, "head")}<span class="brand"><span class="kicker">Espace formation · ${esc(currentSkin()?.name || "Journalisme & IA")}</span><b>Prendre en main les IA génératives</b></span></a>
    <nav class="topnav">
      ${trainer ? link(inSession ? `#/admin/s/${inSession}/jour` : "#/admin", "Back-office", h.startsWith("#/admin")) : link("#/", "Mon espace", h === "#/" || h === "" || h.startsWith("#/s/"))}
      ${link("#/profil", esc(me.full_name || me.email.split("@")[0]), h === "#/profil")}
      <button class="linkbtn" id="logout">Se déconnecter</button>
    </nav></div>
    ${api.mode === "demo" ? `<div class="demo-band">Mode démonstration : données stockées dans ce navigateur uniquement.${isGuest(me) ? "" : ` <button class="linkbtn" id="demoReset">Réinitialiser</button>`}</div>` : ""}
    ${isGuest(me) ? guestBand(me) : ""}
  </header>`;
}

// Bandeau de l'invité·e : lecture seule, date de fin (ou accès terminé)
function guestBand(me) {
  const until = me.guest_until ? dateFr(me.guest_until, { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ") : "";
  const txt = me.guest_active === false
    ? `Votre accès invité a pris fin${until ? ` le ${until}` : ""}. Demandez à l'équipe de le prolonger.`
    : `Invitation · lecture seule${until ? ` jusqu'au ${until}` : ""} : vous pouvez tout consulter, rien n'est enregistré. Les identités des stagiaires sont masquées.`;
  return `<div class="guest-band${me.guest_active === false ? " over" : ""}" role="status">${esc(txt)}</div>`;
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
  if (unfreeze) { unfreeze(); unfreeze = null; }
  currentRoute = route;

  const user = await api.currentUser();
  if (!user && !route.public && !route.any) { go("#/login"); return; }
  // Connexion par code temporaire (première connexion ou code oublié) : choix du code d'accès
  let resetPending = false; try { resetPending = localStorage.getItem(RESET) === "1"; } catch {}
  if (user && resetPending && h !== "#/formateur/code") { go("#/formateur/code"); return; }
  if (user && route.public) { go("#/"); return; }
  me = user ? await api.me() : null;
  if (tok !== renderTok) return;
  if (user && !booted) { booted = true; if (!isGuest(me)) { try { await api.claimInvites(); } catch (e) { console.warn(e); } } }
  if (route.trainer && !canView(me)) { go("#/"); return; }
  if (route.admin && !isAdmin(me)) { go("#/admin"); return; } // pages réservées à l'administration
  if (tok !== renderTok) return;

  // Habillage du centre de formation (session ouverte, sinon habillage par défaut)
  const skin = await skinForRoute(api, h, user).catch(() => null);
  if (tok !== renderTok) return;
  applySkin(skin);
  document.body.classList.toggle("bare", !!route.bare);
  // Invité·e : tout le back-office en lecture seule (l'aperçu côté stagiaire, lui, n'enregistre déjà rien)
  const guest = isGuest(me), frozen = guest && !h.startsWith("#/s/");
  document.body.classList.toggle("ro", frozen);
  app.innerHTML = header(route) + `<main id="view"></main>`;
  $("#logout")?.addEventListener("click", async () => { await api.signOut(); me = null; booted = false; go("#/login"); });
  $("#demoReset")?.addEventListener("click", () => confirm("Effacer toutes les données de démonstration ?") && api.reset());
  const ctx = { api: guest ? readOnlyApi(api) : api, me, go, readOnly: guest, refreshMe: async () => (me = await api.me(true)) };
  ctx.me = me || {};
  if (frozen) unfreeze = freezeControls(document.body);
  try {
    cleanup = (await route.view($("#view"), m.slice(1), ctx)) || null;
  } catch (e) {
    console.error(e);
    $("#view").innerHTML = `<div class="card"><h2>Impossible d'afficher cette page</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Retour à mon espace</a></div>`;
  }
  window.scrollTo(0, 0);
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
render();
