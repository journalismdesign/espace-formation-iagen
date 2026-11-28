/* Espace d'une session côté stagiaire : barre latérale + onglets.
   Onglets : direct (le jour J), cadrage, ressources, fiches, outils,
   discussion. */
import { canView } from "../lib/roles.js";
import { $, $$, T, esc, fr, NB, matches, dateFr, guard, toast, bindCopy, copyText, download, debounce, safeUrl } from "../lib/dom.js";
import { FICHES, GLOSS, PROMPTS, CASES } from "../data.js";
import { renderParcours, parcoursPct, ficheById, ficheHtml, bindRefs, openPrompt, toolsHtml, bindTools, corpusMarkdown, unlockedTools, TOOL_IDS, TOOL_LABELS, hasCadrage } from "../lib/content.js";
import { currentAct, renderInput, renderResults, respKey } from "../lib/activities.js";
import { renderCadrage } from "./cadrage.js";
import { STATUS } from "./home.js";
import { modulesFor, emargementOpen } from "../lib/content.js";
import { signHtml, signError } from "../lib/presence.js";
import { resolveBranding, logosHtml, datesFr, emargementQr, emargementLabels, emargementStepsHtml, evaluationQr, evaluationHtml } from "../lib/brand.js";
import { supportBlock } from "./entry.js";
import { mountChat, chatOn } from "../lib/chat.js";
import { screenHtml } from "../lib/screen.js";
import pauseGif from "../assets/pause.gif";
import { morph } from "../lib/morph.js";
import { loadScreenData } from "./adminSession.js";
import { dayEnd } from "../lib/programme.js";
import { isArchived, sessionEnded, nextTrainingDay, daysLeft, joursTxt, ARCHIVE_CONTACT } from "../lib/archive.js";

const TABS = [
  ["direct", "Le jour J"], ["cadrage", "Mon cadrage"], ["ressources", "Ressources du jour"], ["fiches", "Glossaire"],
  ["outils", "Outils d'exercice"], ["discussion", "Discussion"],
  ["support", "Évaluation et support"], ["emargement", "Émargement"],
];
// Formation terminée (close, ou finie : voir sessionEnded) : les stagiaires gardent le message de fin (Le jour J),
// leurs ressources, les fiches, les exercices et le support, jusqu'à l'archivage
// (ni déroulé, ni discussion, ni émargement ; après la clôture, la discussion est aussi fermée côté base)
const CLOSED_TABS = ["direct", "ressources", "fiches", "outils", "support"];
// Colonne de droite en cours de chargement : « Chargement » et trois points qui apparaissent l'un après l'autre
const LOADING = `<div class="tab-loading" role="status">Chargement<span class="dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>`;
// Salle pas encore ouverte : message d'attente en grand, à la place du contenu. Le jour de la formation (ou sans date) :
// « dans quelques minutes » ; avant : la date de début (et le cadrage à préparer, en deux journées).
const waitHtml = (lead, more = "", title = "Merci de patienter") => `<div class="wait-screen" role="status"><div class="wait-smile" aria-hidden="true">🙂</div>
  <h1>${T(title)}</h1>
  <p class="wait-lead">${T(lead)}</p>${more ? `<p class="wait-more">${T(more)}</p>` : ""}
  <p class="small">${T("Cette page s'ouvrira d'elle-même dès l'ouverture de la salle.")}</p></div>`;
const parisDay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const dayFr = (d) => dateFr(d).replace(/^(\S+) 1 /, "$1 1er ");
// Fin de la formation : merci, jours d'accès restants avant l'archivage, support à télécharger
const endHtml = (sid, n) => `<div class="wait-screen end-screen" role="status"><div class="wait-smile" aria-hidden="true">⌛️</div>
  <h1>${T("Merci de votre participation")}</h1>
  <p class="wait-lead">${T(n == null ? "La formation est terminée, vous gardez l'accès aux ressources. N'oubliez pas de télécharger le support."
    : `La formation est terminée, vous pouvez accéder aux ressources pendant encore ${joursTxt(n)}. N'oubliez pas de télécharger le support.`)}</p>
  <p class="end-actions"><a class="btn" href="#/s/${sid}/support">Télécharger le support</a><a class="btn ghost" href="#/s/${sid}/ressources">Ressources du jour</a></p></div>`;
// Session archivée : plus d'accès pour les stagiaires (fermé aussi côté base), adresse de contact
const archivedHtml = (session) => `<div class="wait-screen end-screen" role="status">
  <h1>${T("Session archivée")}</h1>
  <p class="wait-lead">${T(`La session « ${session.title} » est maintenant archivée : l'accès des stagiaires est fermé.`)}</p>
  <p class="wait-more">${T("Pour plus d'informations, écrivez à")} <a href="mailto:${ARCHIVE_CONTACT}">${ARCHIVE_CONTACT}</a>.</p>
  <p class="end-actions"><a class="btn ghost" href="#/">Mon espace</a></p></div>`;
export const FICHE_CATS = [
  ["comprendre", "Comprendre", ["interface", "configuration"]],
  ["outils", "Les briques des assistants", ["projet", "plugin", "connecteur", "competence", "mcp", "instructions", "notebook"]],
  ["methodes", "Méthodes", ["rmctf", "sve"]],
  ["securiser", "Sécuriser", ["donnees", "injection"]],
];

export async function viewSession(root, [sid, tab = "direct", sub], ctx) {
  const { api, me } = ctx;
  await api.closeFinished().catch(() => 0); // finie depuis plus de 15 min : « Terminée », aussi côté base
  let session = await api.getSession(sid);
  if (!session) {
    root.innerHTML = `<div class="card"><h2>Session introuvable</h2><p class="muted">${T("Vous n'avez pas accès à cette session, ou elle a été supprimée. Rejoignez-la avec son code depuis « Mon espace ».")}</p><a class="btn" href="#/">Mon espace</a></div>`;
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = "direct";
  const membership = await api.myMembership(sid).catch(() => null);
  const trainerPreview = canView(me) && !membership; // équipe ou invité·e (pour qui myMembership vaut toujours null)
  // Archivée (5 jours après le dernier jour) : les stagiaires n'y ont plus accès, seulement un message
  if (!trainerPreview && isArchived(session)) {
    root.classList.remove("withside", "wait-mode");
    root.innerHTML = archivedHtml(session);
    return;
  }
  // Heure de fin de la journée n (déroulé, fin de journée modifiée comprise), sinon l'heure de fin de la session
  const endOf = (n) => dayEnd(modulesFor(session), n) || (session.end_time ? String(session.end_time).slice(0, 5) : null);
  /* Formation terminée : close, dernier jour passé, ou dernier jour salle fermée après l'heure de fin. Le stagiaire voit
     le message de fin dans « Le jour J » et garde ressources, glossaire, exercices et support jusqu'à l'archivage.
     Une évaluation projetée garde la main (carte « En direct ») tant que la session n'est pas close. */
  const endedNow = () => !trainerPreview && sessionEnded(session, { endOf }) && !(session.status !== "closed" && session.live?.view === "evaluation");
  const closedView = endedNow();
  /* Attente : dès que la salle est fermée (status draft) et que la session n'est pas close. Déroulé et carte
     « En direct » masqués, colonne de gauche grisée, message d'attente en grand. Restent actifs : l'émargement,
     et « Mon cadrage » avant le premier jour (préparation des formations de deux journées). Message selon le
     moment : avant le premier jour, la date ; salle déjà ouverte dans la journée (pause), « va reprendre » ;
     sinon « va commencer ». L'aperçu formateur montre la même chose. */
  // Évaluation de fin de stage projetée : elle s'affiche dans la carte « En direct », salle ouverte ou fermée
  const evalOn = () => session.status !== "closed" && session.live?.view === "evaluation";
  const waitingNow = () => !closedView && session.status === "draft" && !evalOn();
  const isWaiting = waitingNow();
  const beforeDay1 = !!session.date && parisDay() < session.date;
  const resumed = session.live?.started?.day === parisDay(); // salle déjà ouverte aujourd'hui : c'est une pause
  const nextDay = nextTrainingDay(session, { endOf }); // soir d'une journée qui n'est pas la dernière
  const WAIT = nextDay
    ? waitHtml(`La journée est terminée. La formation reprendra le ${dayFr(nextDay)}${session.start_time ? `, à ${String(session.start_time).slice(0, 5).replace(":", " h ")}` : ""}.`, "", "Merci pour cette journée")
    : beforeDay1
    ? waitHtml(`La formation commencera le ${dateFr(session.date).replace(/^(\S+) 1 /, "$1 1er ")}${session.start_time ? `, à ${String(session.start_time).slice(0, 5).replace(":", " h ")}` : ""}.`, hasCadrage(session) ? "En attendant, vous pouvez préparer votre cadrage." : "")
    : waitHtml(`La formation va ${resumed ? "reprendre" : "commencer"} dans quelques minutes… Vous pouvez encore aller chercher un café.`);
  const waitAllowed = (t) => t === "emargement" || (t === "cadrage" && beforeDay1); // onglets ouverts pendant l'attente
  if (closedView && !CLOSED_TABS.includes(tab)) { ctx.go(`#/s/${sid}/direct`); return; }
  const shownTabs = TABS.filter(([k]) => !closedView || CLOSED_TABS.includes(k));
  const project = await api.myProject(sid).catch(() => null);
  const live = () => session.status === "live" && !!(session.live?.act || session.live?.view || session.live?.module);
  const br = await resolveBranding(api, session);
  // Outils d'exercice : visibles dès que le formateur a lancé l'exercice qui les utilise (toujours visibles en aperçu formateur)
  const toolsVisible = () => trainerPreview || session.status === "closed" || closedView || unlockedTools(session).size > 0;
  const openTools = () => (session.status === "closed" || closedView ? new Set(TOOL_IDS) : unlockedTools(session)); // formation terminée : tous les exercices
  const left = daysLeft(session);
  // Discussion : ouverte aux stagiaires en formation en ligne seulement (chatOn, comme chat_open côté base) ; toujours en aperçu formateur
  const chatVisible = () => trainerPreview || chatOn(session);

  root.classList.add("withside");
  root.classList.toggle("wait-mode", isWaiting); // (pas « waiting » : classe déjà prise par les activités, en italique)
  root.innerHTML = `
    <aside class="side">
      ${logosHtml(br, "sm")}
      <div class="side-head"><div><b>${T(session.title)}</b><div class="small muted">${T(datesFr(session))}</div></div></div>
      <div class="side-live${live() ? " on" : ""}" id="sideLive"><span class="dot${live() ? " on" : ""}"></span>${live() ? "En direct" : closedView ? "Terminée" : STATUS[session.status]}</div>
      <div id="sideEm"></div>
${closedView ? `      <p class="small muted" style="margin:0 0 12px">${T(`La formation est terminée. Vous gardez l'accès aux ressources, au glossaire, aux exercices et au support${left == null ? "" : ` pendant encore ${joursTxt(left)}`}.`)}</p>
      <div class="side-path"><a href="#/s/${sid}/direct" class="${tab === "direct" ? "cur" : ""}"><span class="ring on">✓</span><div><b>Le jour J</b><div class="small muted">Formation terminée</div></div></a></div>` : `      <div class="side-label">Le parcours</div>
      <div class="side-path">
        <a href="#/s/${sid}/direct" class="${tab === "direct" ? "cur" : ""}"><span class="ring"></span><div><b>Le jour J</b><div class="small muted">La formation en direct</div></div></a>
${hasCadrage(session) ? `        <a href="#/s/${sid}/cadrage" class="${tab === "cadrage" ? "cur" : ""}"><span class="ring${project?.status === "validated" ? " on" : ""}">${project?.status === "validated" ? "✓" : ""}</span><div><b>Mon cadrage</b><div class="small muted">${project?.status === "validated" ? "Cas validé" : "Avant la formation"}</div></div></a>` : ""}
      </div>`}
      <div id="sideExtra"></div>
      <div class="side-label">Ressources</div>
      <nav class="side-nav">${shownTabs.filter(([k]) => !["direct", "cadrage", "emargement"].includes(k)).map(([k, l]) => `<a href="#/s/${sid}/${k}"${k === tab ? ' aria-current="page"' : ""}${k === "outils" ? ` id="navOutils"${toolsVisible() ? "" : " hidden"}` : ""}${k === "discussion" ? ` id="navChat"${chatVisible() ? "" : " hidden"}` : ""}>${l}<span>›</span></a>`).join("")}</nav>
      ${trainerPreview ? `<p class="small muted" style="margin-top:14px">Aperçu formateur : vos clics ne sont pas enregistrés.${isArchived(session) ? " Session archivée : les stagiaires n'y ont plus accès." : sessionEnded(session, { endOf }) ? T(` Formation terminée : les stagiaires voient le message de fin${left == null ? "" : ` (encore ${joursTxt(left)} avant l'archivage)`}.`) : ""} <a href="#/admin/s/${sid}/jour">Retour au back-office</a></p>` : ""}
    </aside>
    <section class="sidemain" id="tabBody"></section>`;
  const body = $("#tabBody", root);
  // En attente : liens du parcours et des ressources désactivés (l'émargement et le retour au back-office restent actifs)
  if (isWaiting) $$(".side-path a, .side-nav a", root).forEach((a) => { if (waitAllowed(a.getAttribute("href").split("/").pop())) return; a.classList.add("off"); a.setAttribute("aria-disabled", "true"); a.tabIndex = -1; a.addEventListener("click", (e) => e.preventDefault()); });
  const cleanups = [];
  // Écouteurs et minuteries propres à l'onglet affiché : coupés à chaque changement d'onglet
  let tabCleanups = [], fullRender = false;
  const tabHandlers = new Set();
  /* Évaluation de fin de stage : quand un lien d'évaluation est renseigné, chaque stagiaire débloque le support en
     touchant « Remplir l'évaluation » (progress.eval, enregistré au clic, le formulaire s'ouvre dans un autre onglet).
     L'évaluation est proposée dans l'onglet Support quand le formateur la projette (ce qui débloque le support côté
     serveur, sessions.support_unlocked), à l'heure de déblocage, ou après la clôture. Aperçu formateur : rien n'est
     enregistré, le clic montre simplement le téléchargement. */
  let previewEval = false;
  const evalDone = () => (membership ? !!membership.progress?.eval : previewEval);
  const evalGate = (shown) => (session.evaluation_url && !evalDone() ? (shown ? "eval" : "later") : null);
  const markEval = async () => {
    if (evalDone()) return;
    if (membership) {
      membership.progress = { ...(membership.progress || {}), eval: new Date().toISOString() };
      await api.saveProgress(sid, membership.progress).catch(() => {});
    } else previewEval = true;
    tabHandlers.forEach((f) => f());
  };
  body.addEventListener("click", (e) => { if (e.target.closest?.("[data-evalgo]")) markEval(); });

  // Mise à jour en direct de la session (activité lancée, statut)
  const refreshSession = debounce(async () => {
    session = (await api.getSession(sid)) || session;
    const l = $("#sideLive", root);
    if (l) { l.className = "side-live" + (live() ? " on" : ""); l.innerHTML = `<span class="dot${live() ? " on" : ""}"></span>${live() ? "En direct" : closedView ? "Terminée" : STATUS[session.status]}`; }
    onSession.forEach((f) => f());
  }, 150);
  const onSession = new Set();
  onSession.add(() => { const n = $("#navOutils", root); if (n) n.hidden = !toolsVisible(); });
  // Formation en ligne coupée pendant la lecture de la discussion : l'onglet disparaît, retour au jour J
  onSession.add(() => {
    const n = $("#navChat", root); if (n) n.hidden = !chatVisible();
    if (tab === "discussion" && !chatVisible() && !fullRender) ctx.go(`#/s/${sid}/direct`);
  });
  // Clôture ou réouverture pendant la consultation : on redessine avec les bons onglets
  // Fin de la formation (clôture, salle fermée après l'heure de fin) ou réouverture pendant la consultation :
  // on redessine avec les bons onglets ; la fin peut aussi arriver avec l'heure, d'où la vérification à la minute
  const recheckEnd = () => { if (!trainerPreview && !fullRender && endedNow() !== closedView) { fullRender = true; ctx.go(location.hash); } };
  onSession.add(recheckEnd);
  const endTimer = setInterval(recheckEnd, 60000); cleanups.push(() => clearInterval(endTimer));
  // Ouverture de la salle pendant l'attente : place au jour J ; fermeture (pause, fin de journée) : retour à l'attente
  onSession.add(() => { if (waitingNow() !== isWaiting) { fullRender = true; ctx.go(isWaiting ? `#/s/${sid}/direct` : location.hash); } });
  /* Évaluation projetée : le stagiaire qui est sur un autre onglet revient au jour J, où la carte « En direct »
     présente le lien. Une fois par projection : il peut ensuite aller chercher le support sans être ramené. */
  let evalSeen = evalOn();
  onSession.add(() => {
    const on = evalOn();
    if (on && !evalSeen && !fullRender && tab !== "direct") ctx.go(`#/s/${sid}/direct`);
    evalSeen = on;
  });
  onSession.add(() => tabHandlers.forEach((f) => f()));
  cleanups.push(api.watch(sid, (e) => { if (e.table === "sessions" || e.table === "*") refreshSession(); }, ["sessions"]));
  // Émargement : bouton vert sous « En direct », affiché pendant les créneaux (début de journée et reprise
  // de l'après-midi, 30 min chacun) ou quand le formateur projette l'émargement ; toujours en aperçu formateur
  const drawEm = () => {
    const box = $("#sideEm", root); if (!box) return;
    const slot = closedView ? null : emargementOpen(session);
    const projected = session.status === "live" && session.live?.view === "emargement";
    const show = !closedView && (trainerPreview || slot || projected);
    const html = show ? `<a class="side-em${tab === "emargement" ? " cur" : ""}" href="#/s/${sid}/emargement"><span>✍</span><span><b>Émargement</b><small>${T(slot ? `${slot.label.replace("Émargement ", "")} · jusqu'à ${hm30(slot.t)}` : projected ? "Le formateur l'affiche maintenant" : "Aperçu : visible aux créneaux prévus")}</small></span><span>›</span></a>` : "";
    if (box.innerHTML !== html) box.innerHTML = html;
  };
  const hm30 = (t) => { const [h, m] = t.split(":").map(Number), x = h * 60 + m + 30; return `${Math.floor(x / 60)} h ${String(x % 60).padStart(2, "0")}`; };
  drawEm(); onSession.add(drawEm);
  const emTimer = setInterval(drawEm, 30000); cleanups.push(() => clearInterval(emTimer));

  body.innerHTML = LOADING;
  await renderTab();

  /* Changer d'onglet ne redessine que la colonne de droite (main.js appelle retab au lieu de tout reconstruire) :
     la colonne de gauche reste en place, seule l'entrée active change. Si le nouvel onglet tarde (appels réseau),
     « Chargement… » remplace l'ancien contenu au bout de 150 ms ; un onglet immédiat ne clignote pas.
     Les changements d'onglet sont traités l'un après l'autre. */
  let chain = Promise.resolve();
  const done = () => { tabCleanups.forEach((f) => f && f()); cleanups.forEach((f) => f && f()); };
  done.retab = async ([sid2, tab2 = "direct", sub2]) => {
    if (fullRender || sid2 !== sid) return false; // autre session, ou clôture/réouverture : tout redessiner
    await (chain = chain.then(async () => {
      tab = TABS.some(([k]) => k === tab2) ? tab2 : "direct"; sub = sub2;
      if (closedView && !CLOSED_TABS.includes(tab)) { ctx.go(`#/s/${sid}/direct`); return; }
      markNav();
      const before = body.firstElementChild; // l'ancien contenu : on ne remplace par « Chargement » que s'il est encore là
      const slow = setTimeout(() => { if (body.firstElementChild === before) body.innerHTML = LOADING; }, 150);
      try { await renderTab(); } finally { clearTimeout(slow); }
    }).catch((e) => console.error(e)));
    return true;
  };
  return done;

  // Entrée active de la colonne de gauche
  function markNav() {
    const here = `#/s/${sid}/${tab}`;
    $$(".side-path a", root).forEach((a) => a.classList.toggle("cur", a.getAttribute("href") === here));
    $$(".side-nav a", root).forEach((a) => (a.getAttribute("href") === here ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    drawEm();
  }

  async function renderTab() {
    tabCleanups.forEach((f) => f && f()); tabCleanups = []; tabHandlers.clear();
    if (isWaiting && !waitAllowed(tab)) { body.innerHTML = WAIT; return; } // avant l'ouverture de la salle
    const extra = $("#sideExtra", root); if (extra) extra.innerHTML = ""; // complément du cadrage
  if (tab === "direct" && closedView) body.innerHTML = endHtml(sid, left); // formation terminée : message de fin
  else if (tab === "direct") await tabDirect();
  else if (tab === "cadrage" && !hasCadrage(session)) ctx.go(`#/s/${sid}/direct`); // pas de cadrage en une journée
  else if (tab === "cadrage") await renderCadrage(body, $("#sideExtra", root), ctx, session, trainerPreview);
  else if (tab === "ressources") await tabRessources();
  else if (tab === "fiches") tabFiches();
  else if (tab === "outils") {
    const drawTools = () => {
      const open = openTools(), masked = TOOL_IDS.filter((id) => !open.has(id));
      if (!$("#toolRmctf", body)) {
        body.innerHTML = `<div class="pagehead"><div><h1>Outils d'exercice</h1><p class="muted">${T("De quoi s'entraîner pendant les temps de pratique, et après. Rien de ce que vous tapez ici ne quitte votre navigateur.")}</p><div id="toolsNote"></div></div></div>
          <p class="empty" id="toolsNone" hidden>${T("Les outils apparaîtront ici quand le formateur abordera, dans le déroulé, la séquence qui s'en sert. Ils resteront ensuite disponibles.")}</p><div id="toolsAll">${toolsHtml()}</div>`;
        bindTools(body);
      }
      // aperçu formateur : les mêmes outils que les stagiaires, et la liste de ceux qui attendent leur séquence
      const note = trainerPreview && session.status !== "closed" ? `<p class="small muted">${T(`Aperçu formateur : vous voyez ce que voient les stagiaires. ${masked.length ? `Masqués jusqu'à leur séquence dans le déroulé : ${masked.map((id) => TOOL_LABELS[id]).join(", ")}.` : "Tous les outils sont débloqués."}`)}</p>` : "";
      if ($("#toolsNote", body).innerHTML !== note) $("#toolsNote", body).innerHTML = note;
      $("#toolsNone", body).hidden = open.size > 0;
      $("#toolsAll", body).hidden = !open.size;
      // les outils pas encore abordés restent dans la page, masqués (liaisons et saisie conservées)
      TOOL_IDS.forEach((id) => { const c = $(`#${id}`, body); if (c) c.hidden = !open.has(id); });
    };
    drawTools();
    tabHandlers.add(drawTools);
  }
  else if (tab === "discussion" && !chatVisible()) ctx.go(`#/s/${sid}/direct`); // formation en salle : pas de discussion
  else if (tab === "discussion") await tabDiscussion();
  else if (tab === "assistant") ctx.go(`#/s/${sid}/ressources`); // assistant IA retiré
  else if (tab === "support") await tabSupport();
  else if (tab === "emargement") await tabEmargement();
  }

  /* ---------------- Le jour J : activité en direct + déroulé ---------------- */
  async function tabDirect() {
    const progress = { ...(membership?.progress || {}) };
    body.innerHTML = `
      <div class="pagehead"><div><div class="kicker-d">Le jour J · ${T(dateFr(session.date))}</div><h1>La formation en direct</h1></div></div>
      <div class="card live" id="liveCard"></div>
      <h2 style="margin:22px 0 8px">Le déroulé</h2>
      <p class="muted small" style="margin-top:0">${T(`Cochez les séquences au fil de la journée. Progression : `)}<b id="pp">${parcoursPct(session, progress, session.live?.module)}${NB}%</b></p>
      <div id="parcours"></div>`;
    const save = debounce((p) => {
      if (!membership) return;
      const q = { ...p, ...(membership.progress?.eval ? { eval: membership.progress.eval } : {}) }; // l'évaluation a pu être touchée entre-temps
      membership.progress = q;
      api.saveProgress(sid, q).catch(() => {});
    }, 600);
    let lastMod;
    let parcLast;
    // créneaux d'émargement validés à l'heure : clé de redessin = séquence + émargements présentés + quart d'heure
    const parcKey = () => [session.live?.module || "", Object.keys(session.live?.emarg || {}).sort().join(","), Math.floor(Date.now() / 300000)].join("|");
    const drawParcours = () => {
      if (parcLast === parcKey()) return; // ne redessine que si quelque chose a changé
      parcLast = parcKey();
      lastMod = session.live?.module || null;
      renderParcours($("#parcours", body), session, progress, (p) => { $("#pp", body).textContent = parcoursPct(session, p, lastMod) + NB + "%"; save(p); }, { currentId: lastMod });
      $("#pp", body).textContent = parcoursPct(session, progress, lastMod) + NB + "%";
    };
    drawParcours();
    tabHandlers.add(drawParcours);
    const parcT = setInterval(drawParcours, 60000); tabCleanups.push(() => clearInterval(parcT));

    let poll = null, lastKey = null, olSeq = 0;
    const drawLive = async () => {
      const card = $("#liveCard", body); if (!card) return;
      const act = currentAct(session);
      clearInterval(poll);
      const L = session.live || {};
      const mod = L.module ? modulesFor(session).find((m) => m.id === L.module) : null;
      const modLine = mod ? `<div class="small muted" style="margin-top:4px">En ce moment : <b>${T(mod.titre)}</b></div>` : "";
      // Formation en ligne : l'écran projeté s'affiche ici (hors activités, qui gardent leur saisie)
      if (session.online && session.status === "live" && (!act || act.type === "welcome")) {
        if (!$("#olScr", card)) {
          card.innerHTML = `<div class="online-head"><div class="kicker-d"><span class="dot on"></span> En direct · écran du formateur</div><button class="btn sm ghost" id="olFs" type="button">Plein écran</button></div>
            <div class="online-screen" id="olScr"></div><div id="olNote"></div>`;
          $("#olFs", card).onclick = () => { const el = $("#olScr", card); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.(); };
        }
        const n = ++olSeq;
        const data = await loadScreenData(api, session, { trainee: !trainerPreview }).catch(() => null);
        if (n !== olSeq || !data || !$("#olScr", card)) return;
        morph($("#olScr", card), screenHtml({ ...data, session, qrUrl: "", forTrainee: true }));
        let note = L.view === "module" && mod?.obj ? `<ul class="small" style="margin:10px 0 0">${mod.obj.map((x) => `<li>${T(x)}</li>`).join("")}</ul>` : "";
        if (L.view === "evaluation" && session.evaluation_url) { // l'écran montre le QR : ici le bouton, et le support une fois l'évaluation touchée
          const st = await api.supportStatus(sid).catch(() => null);
          if (n !== olSeq || !$("#olNote", card)) return;
          note = `<div class="eval-sup"><p style="margin:10px 0"><a class="btn" href="${safeUrl(session.evaluation_url)}" target="_blank" rel="noopener noreferrer" data-evalgo>Remplir l'évaluation ↗</a></p>${st?.configured ? supportBlock(st, false, evalGate(true)) : ""}</div>`;
        }
        if ($("#olNote", card).innerHTML !== note) $("#olNote", card).innerHTML = note;
        return;
      }
      olSeq++;
      if ((session.status !== "live" && !evalOn()) || (!act && !L.view)) {
        card.innerHTML = `<div class="kicker-d">En direct</div>${modLine}<p class="empty" style="margin:8px 0 0">${session.status === "closed" ? "La session est close. Le déroulé et les ressources restent consultables." : "Les sondages, quiz et consignes s'afficheront ici quand le formateur les lancera. Gardez cette page ouverte."}</p>`;
        return;
      }
      if (!act) {
        let h = "";
        if (L.view === "title") h = `<h3>Bienvenue</h3><p class="muted">${T("La formation commence. Le déroulé de la journée est juste en dessous.")}</p>`;
        else if (L.view === "emargement") {
          const qr = await emargementQr(session);
          const EL = emargementLabels(session, br);
          h = `<h3>${EL.second && EL.client ? "Deux étapes pour émarger" : "Émargement"}</h3>${emargementStepsHtml(session, qr, emargementLabels(session, br))}`;
        } else if (L.view === "support") h = `<h3>Le support de la formation</h3>${supportBlock(await api.supportStatus(sid).catch(() => ({})))}`;
        else if (L.view === "trainer") {
          const t = session.trainer_id ? (await api.listTrainers().catch(() => [])).find((x) => x.id === session.trainer_id) : null;
          h = t ? `<div class="tr-card">${t.photo ? `<img src="${esc(t.photo)}" alt="">` : ""}<div><div class="small muted">L'intervenant</div><h3 style="margin:2px 0 6px">${T(t.name)}</h3>
            <ul class="small" style="margin:0;padding-left:18px">${(t.roles || []).map((r) => `<li>${T(r.label)} ${r.url ? `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${T(r.value)}</a>` : T(r.value || "")}</li>`).join("")}</ul>
            <p class="small" style="margin:8px 0 0">${t.email ? `<a href="mailto:${esc(t.email)}">${esc(t.email)}</a>` : ""}${t.website ? ` · <a href="${safeUrl(t.website)}" target="_blank" rel="noopener noreferrer">${esc(t.website.replace(/^https?:\/\//, ""))}</a>` : ""}${(t.socials || []).map((x) => ` · ${x.url ? `<a href="${safeUrl(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a>` : esc(x.label)}`).join("")}</p></div></div>` : `<h3>L'intervenant</h3>`;
        }
        else if (L.view === "evaluation") {
          const ev = evaluationHtml(session, await evaluationQr(session)), st = await api.supportStatus(sid).catch(() => null);
          h = `<h3>Évaluation de fin de stage</h3>${ev || `<p class="muted">Le formateur vous indique comment évaluer la formation.</p>`}${st?.configured ? `<div class="eval-sup">${supportBlock(st, false, evalGate(true))}</div>` : ""}`;
        }
        else if (L.view === "deck") { const d = (session.decks || []).find((x) => x.id === L.deck); h = `<h3>${T(d?.title || "Présentation")}</h3><p class="muted">Le formateur projette une présentation.</p>`; }
        else if (L.view === "pause") h = `<div class="pause-card"><img src="${pauseGif}" alt=""><div><h3 style="margin:0 0 4px">Pause</h3><p class="muted" style="margin:0">${T("Cette page se mettra à jour à la reprise.")}</p></div></div>`;
        else if (L.view === "slide") h = `<h3>${T(mod?.titre || "Présentation")}</h3><p class="muted">${T(`Le formateur présente la page ${L.slide} du support.`)}</p>`;
        else h = `<h3>${T(mod?.titre || "")}</h3>${mod?.obj ? `<ul class="small">${mod.obj.map((x) => `<li>${T(x)}</li>`).join("")}</ul>` : ""}`;
        card.innerHTML = `<div class="kicker-d">${session.status === "live" ? `<span class="dot on"></span> En direct` : "Fin de la formation"}</div>${h}`; // salle fermée : seule l'évaluation arrive ici
        return;
      }
      const key = respKey(act, session.live, session);
      const mine = membership ? await api.myResponse(sid, key).catch(() => undefined) : undefined;
      card.innerHTML = `<div class="kicker-d"><span class="dot on"></span> En direct · ${T(act.titre)}</div><div id="liveIn"></div><div id="liveOut" style="margin-top:12px"></div>`;
      const showResults = async () => {
        const out = $("#liveOut", card); if (!out) return;
        if (["welcome", "projects"].includes(act.type)) { out.innerHTML = ""; return; }
        const m = membership ? await api.myResponse(sid, key).catch(() => undefined) : undefined;
        if (m === undefined && !session.live.reveal && !trainerPreview) { out.innerHTML = `<p class="small muted">Les réponses du groupe s'afficheront après la vôtre.</p>`; return; }
        const rows = await api.results(sid, key).catch(() => []);
        out.innerHTML = `<div class="small muted">Réponses du groupe</div>` + renderResults(act, session.live, rows, false, session);
      };
      renderInput($("#liveIn", card), act, session.live, mine, async (v) => {
        if (trainerPreview) { toast("Aperçu formateur : réponse non enregistrée."); return; }
        await guard(() => api.respond(sid, key, v));
        lastKey = null; drawLive();
      }, session);
      showResults();
      poll = setInterval(showResults, 4000); // les réponses des autres ne sont lisibles qu'agrégées
      lastKey = key;
    };
    tabHandlers.add(drawLive);
    tabCleanups.push(() => clearInterval(poll));
    drawLive();
  }

  /* ---------------- Ressources du jour ---------------- */
  async function tabRessources() {
    const [secrets, resources] = await Promise.all([api.listSecrets(sid), api.listResources(sid)]);
    body.innerHTML = `
      <div class="pagehead"><div><div class="kicker-d">Ressources · ${T(session.title)}</div><h1>Ressources du jour</h1></div></div>
      ${secrets.length ? `<div class="card" style="margin-bottom:14px"><h3>Codes et accès des exercices</h3>
        <p class="small muted" style="margin-top:0">${T("Utilisez-les uniquement pendant les exercices. Ne les collez jamais dans un prompt ni dans un document partagé.")}</p>
        <div class="grid g2">${secrets.map((s) => `<div class="secret"><b>${T(s.label)}</b>${s.value ? `<div class="mono small" id="sec-${s.id}">${esc(s.value)}</div><button class="btn sm ghost" data-copy="sec-${s.id}">Copier</button>` : `<div class="small muted">Pas encore disponible.</div>`}</div>`).join("")}</div></div>` : ""}
      ${resources.length ? `<div class="card" style="margin-bottom:14px"><h3>Liens de la session</h3>${resources.map((r) => `<div class="res"><a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${T(r.title)} ↗</a></div>`).join("")}</div>` : ""}
      <div class="card boxed"><div class="kicker-d">Boîte à outils du jour</div><h2 style="margin:4px 0 12px">Prompts, exercices et exemples</h2>
        ${PROMPTS.map((p) => `<details class="acc"><summary><b>${T(p.titre)}</b> <span class="pill">${T(p.tag)}</span> <span class="small muted">p.${NB}${p.page}</span></summary>
          <p class="small muted">${T("Copiez ce prompt dans l'assistant de votre choix, puis remplacez les passages entre crochets.")}</p>
          <div class="prompt-wrap"><button class="btn sm" data-copy="rp-${p.id}">Copier le prompt</button><div class="prompt" id="rp-${p.id}">${esc(p.txt)}</div></div></details>`).join("")}
        <details class="acc"><summary><b>Exemples de rédactions</b> <span class="pill">${CASES.length}</span></summary>
          ${[...new Set(CASES.map((c) => c[0]))].map((g) => `<h4 style="margin:12px 0 4px">${T(g)}</h4>${CASES.filter((c) => c[0] === g).map((c) => `<div class="res small"><b>${T(c[1])}</b> · ${T(c[2])} <span class="muted">(p.${NB}${c[3]})</span></div>`).join("")}`).join("")}
          <p class="small muted">${T("Les chiffres viennent souvent des médias eux-mêmes : ce sont leurs déclarations.")}</p></details>
      </div>`;
    bindCopy(body);
  }

  /* ---------------- Glossaire (fiches, termes, prompts) ---------------- */
  function tabFiches() {
    if (sub) {
      const f = ficheById(sub);
      body.innerHTML = f ? `<p><a href="#/s/${sid}/fiches">← Toutes les fiches</a></p><article class="card article">${ficheHtml(f, true)}</article>` : `<p class="empty">Fiche introuvable.</p>`;
      $$("[data-fiche]", body).forEach((b) => (b.onclick = () => ctx.go(`#/s/${sid}/fiches/${b.dataset.fiche}`)));
      $$("[data-prompt]", body).forEach((b) => (b.onclick = () => openPrompt(b.dataset.prompt))); // prompts : panneau latéral
      bindCopy(body);
      return;
    }
    let cat = "tout", kind = "fiches";
    body.innerHTML = `
      <div class="pagehead"><div><div class="kicker-d">Glossaire · ${T(session.title)}</div><h1>Glossaire</h1></div>
        <button class="btn" id="useAi" title="Copie toutes les ressources en Markdown, à coller dans votre assistant">Utiliser les ressources avec une IA</button></div>
      <div class="subnav" id="kinds">${[["fiches", `Fiches (${FICHES.length})`], ["glossaire", `Glossaire (${GLOSS.length})`], ["prompts", `Prompts (${PROMPTS.length})`]].map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join("")}</div>
      <div class="subnav" id="cats"></div>
      <div class="fiches-layout"><div><input type="search" id="fq" placeholder="Chercher une fiche, un terme…" aria-label="Rechercher"><div class="small muted" id="fcount" style="margin:6px 0"></div><div id="flist" class="flist"></div></div><div id="fbody"></div></div>`;
    const draw = () => {
      const q = $("#fq", body).value.trim();
      $$("#kinds button", body).forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === kind));
      $("#cats", body).innerHTML = kind === "fiches" ? [["tout", "Tout"], ...FICHE_CATS.map(([k, l]) => [k, l])].map(([k, l]) => `<button data-c="${k}" aria-pressed="${k === cat}">${l}</button>`).join("") : "";
      $$("#cats button", body).forEach((b) => (b.onclick = () => { cat = b.dataset.c; draw(); }));
      if (kind === "fiches") {
        const ids = cat === "tout" ? null : FICHE_CATS.find((c) => c[0] === cat)[2];
        const L = FICHES.filter((f) => (!ids || ids.includes(f.id)) && matches(q, f.titre, f.resume, JSON.stringify(f.sections)));
        $("#fcount", body).textContent = `${L.length} fiche${L.length > 1 ? "s" : ""}`;
        $("#flist", body).innerHTML = FICHE_CATS.map(([, l, ids2]) => { const G = L.filter((f) => ids2.includes(f.id)); return G.length ? `<div class="flist-g">${T(l)}</div>${G.map((f) => `<a href="#/s/${sid}/fiches/${f.id}">${T(f.titre)}</a>`).join("")}` : ""; }).join("");
        $("#fbody", body).innerHTML = L.length ? `<div class="grid g2">${L.map((f) => `<a class="card fcard" href="#/s/${sid}/fiches/${f.id}"><span class="ico">${esc(f.ico)}</span><h3>${T(f.titre)}</h3><p class="small" style="margin:0">${T(f.resume)}</p></a>`).join("")}</div>` : `<p class="empty">Aucune fiche ne correspond. Essayez le glossaire ou l'assistant.</p>`;
      } else if (kind === "glossaire") {
        const L = GLOSS.filter((g) => matches(q, g[0], g[1]));
        $("#fcount", body).textContent = `${L.length} terme${L.length > 1 ? "s" : ""}`;
        $("#flist", body).innerHTML = L.map((g) => `<a href="#g-${esc(g[0])}">${T(g[0])}</a>`).join("");
        $("#fbody", body).innerHTML = `<div class="card"><dl style="margin:0">${L.map((g) => `<div class="gl" id="g-${esc(g[0])}"><dt>${T(g[0])}</dt><dd>${T(g[1])} <span class="muted small">(p.${NB}${g[3]})</span>${g[2] && ficheById(g[2]) ? ` <a class="chip" href="#/s/${sid}/fiches/${g[2]}">Fiche : ${T(ficheById(g[2]).titre)}</a>` : ""}</dd></div>`).join("")}</dl></div>`;
        $$("#flist a", body).forEach((a) => (a.onclick = (e) => { e.preventDefault(); document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth" }); }));
      } else {
        const L = PROMPTS.filter((p) => matches(q, p.titre, p.tag, p.txt));
        $("#fcount", body).textContent = `${L.length} prompt${L.length > 1 ? "s" : ""}`;
        $("#flist", body).innerHTML = "";
        $("#fbody", body).innerHTML = `<div class="grid g2">${L.map((p) => `<div class="card"><span class="pill">${T(p.tag)}</span> <span class="small muted">p.${NB}${p.page}</span><h3 style="margin-top:8px">${T(p.titre)}</h3><div class="prompt" id="pr-${p.id}">${esc(p.txt)}</div><button class="btn sm" data-copy="pr-${p.id}">Copier</button></div>`).join("")}</div>`;
        bindCopy(body);
      }
    };
    $("#fq", body).oninput = draw;
    $$("#kinds button", body).forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
    $("#useAi", body).onclick = async (e) => {
      const md = corpusMarkdown();
      await copyText(md, e.target);
      download("ressources-ia-generative.md", md, "text/markdown;charset=utf-8");
      toast("Ressources copiées : collez-les dans votre assistant, ou joignez le fichier téléchargé.", "ok");
    };
    draw();
  }

  /* ---------------- Discussion (messagerie) ---------------- */
  async function tabDiscussion() {
    body.innerHTML = `<div class="pagehead"><div><div class="kicker-d">${T(session.title)}</div><h1>Discussion</h1><div id="chatNote"></div></div></div><div id="chatBox"></div>`;
    tabCleanups.push(mountChat($("#chatBox", body), { api, sid, me, staff: trainerPreview }));
    // aperçu formateur : dire quand les stagiaires ne voient pas cet onglet
    const note = () => {
      const n = $("#chatNote", body); if (!n) return;
      const txt = !trainerPreview || chatOn(session) ? ""
        : session.status === "closed" ? "Aperçu formateur : la session est close, les stagiaires n'ont plus accès à la discussion."
        : "Aperçu formateur : les stagiaires ne voient pas la discussion. Elle s'ouvre quand vous activez « Formation en ligne » dans le Jour J.";
      const html = txt ? `<p class="small muted">${T(txt)}</p>` : "";
      if (n.innerHTML !== html) n.innerHTML = html;
    };
    note(); tabHandlers.add(note);
  }

  /* ---------------- Support ---------------- */
  async function tabSupport() {
    const draw = async () => {
      const st = await api.supportStatus(sid).catch(() => ({ configured: false }));
      // évaluation proposée : projetée (ou déjà projetée : support débloqué), heure de déblocage passée, session close
      const shown = !!st.unlocked || session.status === "closed" || session.live?.view === "evaluation";
      const ev = shown ? evaluationHtml(session, await evaluationQr(session)) : "";
      if (tab !== "support") return; // onglet changé pendant le chargement
      body.innerHTML = `<div class="pagehead"><div><div class="kicker-d">${T(session.title)}</div><h1>Évaluation et support</h1></div></div>${ev ? `<div class="card" style="max-width:820px;margin-bottom:14px">${ev}</div>` : ""}<div class="card" style="max-width:720px">${supportBlock(st, false, evalGate(!!ev))}</div>`;
    };
    await draw();
    tabHandlers.add(draw); // évaluation projetée, évaluation touchée : la page suit
    const t = setInterval(draw, 60000); // le déblocage se fait à l'heure dite
    tabCleanups.push(() => clearInterval(t));
  }

  /* ---------------- Émargement ---------------- */
  async function tabEmargement() {
    const qr = await emargementQr(session);
    // Créneau ouvert : « J'ai émargé » (feuille d'émargement de l'équipe, migration …_numeros_emargements.sql)
    const slot = closedView ? null : emargementOpen(session);
    const mine = slot && !trainerPreview ? (await api.myMembership(sid).catch(() => null))?.presence || {} : {};
    body.innerHTML = `<div class="pagehead"><div><div class="kicker-d">${T(session.title)}</div><h1>Émargement</h1><p class="muted">${T("Deux étapes, à chaque demi-journée : l'émargement de l'organisme de formation, puis celui de votre entreprise.")}</p></div></div>
      <div class="card" style="max-width:820px">${emargementStepsHtml(session, qr, emargementLabels(session, br))}${signHtml(slot, mine, T, { preview: trainerPreview })}</div>`;
    $$("[data-sign]", body).forEach((b) => (b.onclick = async () => {
      if (trainerPreview) return toast("Aperçu formateur : rien n'est enregistré.");
      b.disabled = true;
      try { await api.signPresence(sid, b.dataset.sign); toast("Émargement enregistré.", "ok"); await tabEmargement(); }
      catch (e) { b.disabled = false; toast(signError(e), "ko"); }
    }));
  }


}
