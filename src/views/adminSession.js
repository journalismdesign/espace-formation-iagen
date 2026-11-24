/* Back-office d'une session, en trois temps :
   Avant (accès, invitations, cadrages), Jour J (animation en direct),
   Après (projets, émargement, bilan, duplication, résultats, ressources). */
import { mountChat } from "../lib/chat.js";
import { keepDraft } from "../lib/draft.js";
import { $, $$, T, esc, fr, NB, guard, toast, debounce, dateFr, download, copyText } from "../lib/dom.js";
import { QUIZ } from "../data.js";
import { ACT_TYPES, currentAct, respKey, renderResults, defaultActivities, countOf } from "../lib/activities.js";
import { screenHtml, nextPage, stepLive, pageKey, modPages, skipSet } from "../lib/screen.js";
import { openSheet } from "../lib/content.js";
import { joinUrl, joinUrlLabel, qr, showQr, parseEmails, openDuplicate } from "./admin.js";
import { logoPair } from "./settings.js";
import { STEPS, SENSIB, VERIF } from "./cadrageModel.js";
import { datesFr, hhmm, emargementQr, fileToDataUrl, resolveBranding, logosHtml, EM2_DEFAULT, evaluationQr, EVAL_TITLE, EVAL_TEXT } from "../lib/brand.js";
import { modulesFor, daysOf, typeLabel, hasCadrage, emargementSlots } from "../lib/content.js";
import { parseConducteur, conducteurMarkdown } from "../lib/conducteur.js";
import { loadSkins, skinFor, applySkin, currentSkin } from "../lib/skin.js";
import { samsaHtml } from "../lib/brand.js";
import { isAdmin } from "../lib/roles.js";
import { morph } from "../lib/morph.js";
import { parsePages, formatPages, slideEmbedUrl, deckId, deckKind } from "../deck.js";

const PHASES = [["reglages", "Réglages"], ["avant", "Avant — inscription et cadrage"], ["jour", "Jour J — pilotage"], ["apres", "Après — suivi"]];
const phaseLabel = (k, l, session) => (k === "avant" && !hasCadrage(session) ? "Avant — inscription" : l);
const hhmmT = (t) => t.replace(/^0/, "").replace(":", " h ");
const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
// Insère les créneaux d'émargement dans le déroulé, à leur heure
function interleave(mods, slots) {
  const out = []; const rest = [...slots].sort((a, b) => mins(a.t) - mins(b.t));
  mods.forEach((m) => { while (rest.length && mins(rest[0].t) <= mins(m.t[0])) out.push({ ...rest.shift(), slot: true }); out.push(m); });
  rest.forEach((x) => out.push({ ...x, slot: true }));
  return out;
}
const parisDay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
// Seconde ligne de l'interrupteur « Formation en ligne » de l'en-tête
const onlineSub = (on) => (on ? "écran visible par les stagiaires" : "désactivée");
// Première ouverture de la salle du jour : point de départ du chronomètre du pilotage
const stamp = (live) => (live?.started?.day === parisDay() ? live.started : { day: parisDay(), at: new Date().toISOString() });
const firstName = (r) => (r.full_name || r.email.split("@")[0]).split(" ")[0];

// Données de l'écran projeté (réponses agrégées, participants, projets)
// Écrans d'ouverture et de clôture (projetables salle fermée)
export const OPENING_VIEWS = new Set(["title", "trainer", "emargement", "support", "evaluation", "qr"]);

export async function loadScreenData(api, session, { trainee = false } = {}) {
  const act = currentAct(session);
  const [rows, roster, projects] = await Promise.all([
    act && session.status === "live" ? api.results(session.id, respKey(act, session.live)) : [],
    trainee ? [] : api.roster(session.id).catch(() => []), // le tableau des participants est réservé à l'équipe
    act?.type === "projects" ? api.listProjects(session.id) : [],
  ]);
  const byUser = Object.fromEntries(roster.map((r) => [r.user_id, r]));
  const view = session.live?.view;
  return {
    branding: await resolveBranding(api, session),
    emQr: view === "emargement" ? await emargementQr(session, 700) : null,
    support: view === "support" ? await api.supportStatus(session.id).catch(() => null) : null,
    evalQr: view === "evaluation" ? await evaluationQr(session, 700) : null,
    trainer: view === "trainer" && session.trainer_id ? (await api.listTrainers().catch(() => [])).find((t) => t.id === session.trainer_id) || null : null,
    rows, participants: roster.length,
    projects: projects.filter((p) => p.status === "validated").map((p) => ({ titre: p.data?.retenu?.titre || "Sans titre", description: p.data?.retenu?.description, auteur: byUser[p.user_id] ? firstName(byUser[p.user_id]) : "" })),
  };
}

export async function viewAdminSession(root, [sid, phase = "avant"], ctx) {
  const admin = isAdmin(ctx.me); // l'attribution, l'habillage et la duplication restent à l'administration
  const { api, go } = ctx;
  let session = await api.getSession(sid);
  if (!session) { root.innerHTML = `<div class="card"><h2>Session introuvable</h2><a class="btn" href="#/admin">Retour</a></div>`; return; }
  if (!PHASES.some(([k]) => k === phase)) phase = "avant";
  const qrUrl = await qr(joinUrl(session.code), 480);

  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div>
      <h1 style="margin:0">${T(session.title)}</h1>
      <p class="muted" style="margin:4px 0">${T(session.formation)} · ${T(datesFr(session))} · code <b class="mono">${esc(session.code)}</b></p>
      <div class="head-live"><div class="clock" id="clock" aria-live="off"></div>
        <div class="joinbox"><img src="${qrUrl}" alt="QR code de la session"><span class="jb-txt"><span class="small">Rejoindre la session</span><b class="mono">${esc(session.code)}</b></span><button class="btn sm ghost" id="pjQ" title="Afficher le QR code sur l'écran projeté (salle ouverte ou non)">Projeter le QR code</button></div>
        <label class="onlinebox${session.online ? " on" : ""}" id="onlineLbl" title="${esc(fr("Formation à distance : les stagiaires voient dans leur espace ce que montre l'écran projeté (pages du support, présentations, séquences, émargement)."))}"><input type="checkbox" role="switch" id="onlineMode"${session.online ? " checked" : ""}><span class="ob-txt"><b>Formation en ligne</b><span class="small" id="onlineSub">${onlineSub(session.online)}</span></span></label></div>
    </div>
    <div class="head-actions"><a class="btn ghost sm" href="#/s/${sid}" title="Voir l'espace tel que le voient les stagiaires">Voir côté stagiaire</a>
      ${session.status === "draft" ? `<button class="btn sm" data-status="live">Ouvrir la salle</button>` : session.status === "live" ? `<button class="btn sm ghost" data-status="draft">Fermer la salle</button>` : `<button class="btn sm ghost" data-status="live">Rouvrir</button>`}</div></div>
    <div class="phases">${PHASES.map(([k, l]) => `<a href="#/admin/s/${sid}/${k}"${k === phase ? ' aria-current="page"' : ""}>${phaseLabel(k, l, session)}</a>`).join("")}</div>
    <div id="phase"></div>`;
  $$("[data-status]", root).forEach((b) => (b.onclick = async () => {
    const st = b.dataset.status;
    await guard(() => api.updateSession(sid, { status: st, live: st === "live" ? { ...(session.live || {}), ...(!session.live?.view && !session.live?.act ? { view: "title", started_at: new Date().toISOString() } : {}), started: stamp(session.live) } : (session.live?.started ? { started: session.live.started } : {}) }), st === "live" ? "Salle ouverte : les stagiaires peuvent répondre." : "Salle fermée.");
    go(location.hash);
  }));

  const box = $("#phase", root);
  const cleanups = [];

  /* En-tête : état de la salle, heure de Paris et minuteur de la journée.
     Le minuteur part de l'heure d'ouverture prévue dans la session (Réglages → heure de début), ou de l'heure
     de la remise à zéro faite ce jour-là avec le bouton ↺ (live.clock = {day, at}).
     Même dessin que le minuteur de pratique des stagiaires : pavé sombre, libellé à gauche, heure en chasse fixe. */
  const hm2 = (h, m) => `${String(h).padStart(2, "0")} h ${String(m).padStart(2, "0")}`;
  const parisMin = (d) => { const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).split(":").map(Number); return h * 60 + m; };
  const clockRef = () => { // minute du jour (heure de Paris) d'où part le minuteur
    const c = session.live?.clock;
    if (c?.day === parisDay()) return parisMin(new Date(c.at));
    const [h, m] = String(session.start_time || "09:30").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const tick = () => {
    const el = $("#clock", root); if (!el) return;
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
    const nowMin = parisMin(new Date()), ref = clockRef(), refTxt = hm2(Math.floor(ref / 60), ref % 60), on = session.status === "live";
    // Pastille d'état toujours au même gabarit (rond + libellé) et seconde ligne toujours présente : le pavé ne change pas de hauteur
    const state = on ? `<span class="state live">En direct</span>` : `<span class="state off">${session.status === "closed" ? "Session terminée" : "Salle fermée"}</span>`;
    const sub = session.status === "closed" ? "" : nowMin < ref ? `début prévu à ${refTxt}` : on ? `écoulé ${dur(nowMin - ref)} · depuis ${refTxt}` : `journée commencée à ${refTxt}`;
    const html = `<span class="clk-lbl">${state}<span class="clk-sub">${sub ? fr(sub) : "&nbsp;"}</span></span><b class="t">${hm2(Math.floor(nowMin / 60), nowMin % 60)}</b>`
      + `<button type="button" class="clk-reset" data-clk-reset title="Remettre le minuteur à zéro : le temps écoulé repart de maintenant" aria-label="Remettre le minuteur à zéro">↺</button>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    qrBtn(); // l'écran a pu changer depuis le pilotage ou l'écran projeté
  };
  // ↺ du minuteur (délégation : le contenu du pavé est réécrit à chaque minute)
  $("#clock", root).onclick = async (e) => {
    if (!e.target.closest("[data-clk-reset]")) return;
    const live = { ...(session.live || {}), clock: { day: parisDay(), at: new Date().toISOString() } };
    session = await guard(() => api.updateSession(sid, { live }), "Minuteur remis à zéro : le temps écoulé repart de maintenant.") || session;
    tick(); afterLive();
  };
  // Interrupteur « Formation en ligne » de l'en-tête (tous les onglets) : l'écran projeté s'affiche dans l'espace des stagiaires
  $("#onlineMode", root).onchange = async (e) => {
    const on = e.target.checked;
    const s2 = await guard(() => api.updateSession(sid, { online: on }), on ? "Mode en ligne : les stagiaires voient l'écran dans leur espace." : "Mode en ligne désactivé.");
    if (s2) session = s2; else e.target.checked = !on;
    $("#onlineLbl", root).classList.toggle("on", !!session.online);
    $("#onlineSub", root).textContent = onlineSub(session.online);
  };
  /* « Projeter le QR code » de l'en-tête, en bascule, depuis tous les onglets, salle ouverte ou non :
     un clic met la slide « Rejoindre » sur l'écran projeté (pour un·e retardataire) en gardant de côté ce qui
     était projeté (live.prev) ; un second clic remet cet écran. Lancer autre chose entre-temps abandonne live.prev. */
  const KEEP = ["module", "emarg", "tools", "started", "clock"]; // ce qui survit à tout changement d'écran
  const pick = (o, keep) => Object.fromEntries(Object.entries(o).filter(([k]) => keep(k)));
  let afterLive = () => {}; // le pilotage du Jour J redessine l'aperçu
  function qrBtn() {
    const b = $("#pjQ", root); if (!b) return;
    const on = session.live?.view === "qr", label = on ? "QR code projeté" : "Projeter le QR code";
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Revenir à l'écran projeté avant le QR code" : "Afficher le QR code sur l'écran projeté (salle ouverte ou non)";
  }
  $("#pjQ", root).onclick = async () => {
    const l = session.live || {}, base = pick(l, (k) => KEEP.includes(k));
    const back = l.view === "qr";
    const live = back ? { ...base, ...(l.prev || {}) }
      : { ...base, view: "qr", prev: pick(l, (k) => !KEEP.includes(k) && k !== "prev"), started_at: new Date().toISOString() };
    session = await guard(() => api.updateSession(sid, { live }), back ? "Retour à l'écran précédent." : "QR code projeté. Un second clic remet l'écran précédent.") || session;
    qrBtn(); afterLive();
  };
  tick(); const clockT = setInterval(tick, 5000); cleanups.push(() => clearInterval(clockT));

  if (phase === "reglages") await phaseReglages();
  else if (phase === "avant") await phaseAvant();
  else if (phase === "jour") await phaseJour();
  else await phaseApres();
  return () => cleanups.forEach((f) => f());

  /* =================================================================
     RÉGLAGES : format, dates, horaires, logo, support, émargement, slides
     ================================================================= */
  async function phaseReglages() {
    const skinData = await loadSkins(api);
    const [brands, sup, trainers] = await Promise.all([api.listBrands(), api.supportStatus(sid).catch(() => ({})), api.listTrainers().catch(() => [])]);
    let decks = [...(session.decks || [])];
    let evQr = session.evaluation_qr || null;
    let clientLogo = session.client_logo || null, clientLogoLight = session.client_logo_light || null, emQr = session.emargement_qr || null;
    box.innerHTML = `
    <form id="regF" class="grid adm2">
      <div>
        <div class="card"><h3>La formation</h3>
          <label class="f" for="gT">Titre affiché aux stagiaires</label><input type="text" id="gT" required maxlength="140" value="${esc(session.title)}">
          <label class="f" for="gF">Intitulé de la formation</label><input type="text" id="gF" maxlength="140" value="${esc(session.formation)}">
          <label class="f" for="gSk">Habillage (centre de formation)</label>
          <select id="gSk"${admin ? "" : " disabled"}><option value="">Par défaut · ${esc(skinData.skins.find((k) => k.id === skinData.def)?.name || "Samsa")}</option>${skinData.skins.map((k) => `<option value="${k.id}"${session.skin_id === k.id ? " selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
          <p class="small muted" style="margin-top:4px">${T("Couleur d'accent et logo du centre, appliqués à l'espace stagiaire, aux slides d'entrée et à l'écran. ")}${admin ? `<a href="#/admin/reglages">Gérer les habillages</a>` : "Choisi par l'administration."}</p>
          <label class="f">Format</label>
          <div class="chips" id="gFmt">${[["1", "Une journée"], ["2", "Deux journées"]].map(([v, l]) => `<label class="radio"><input type="radio" name="fmt" value="${v}"${session.format === v ? " checked" : ""}${session.programme?.modules?.length ? " disabled" : ""}> ${l}</label>`).join("")}</div>
          <p class="small muted">${T("Le format détermine le déroulé visible côté stagiaire : en une journée, seul le programme d'une journée est accessible.")}</p>
          <div class="grid g2">
            <div><label class="f" for="gD1">Date (jour 1)</label><input type="date" id="gD1" value="${esc(session.date || "")}"></div>
            <div id="d2wrap"><label class="f" for="gD2">Date (jour 2)</label><input type="date" id="gD2" value="${esc(session.date2 || "")}"></div>
            <div><label class="f" for="gS">Début</label><input type="time" id="gS" value="${esc(String(session.start_time || "09:30").slice(0, 5))}"></div>
            <div><label class="f" for="gE">Fin</label><input type="time" id="gE" value="${esc(String(session.end_time || "17:30").slice(0, 5))}"></div>
          </div>
        </div>
        <div class="card" style="margin-top:14px" id="condCard"><h3>Conducteur</h3>
          <p class="small" id="condSrc"></p>
          <div class="cond-actions">
            <label class="btn sm">Importer un conducteur (.md)<input type="file" id="condFile" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden></label>
            <button type="button" class="btn sm ghost" id="condExport">Télécharger le conducteur actuel (.md)</button>
            <button type="button" class="linkbtn" id="condReset"${session.programme?.modules?.length ? "" : " hidden"}>Revenir au déroulé par défaut</button>
          </div>
          <div id="condPrev"></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Intervenant·e</h3>
          <select id="gTr"${admin ? "" : " disabled"}><option value="">— Choisir une fiche —</option>${trainers.map((t) => `<option value="${t.id}"${session.trainer_id === t.id ? " selected" : ""}>${T(t.name)}</option>`).join("")}</select>
          <p class="small muted">${T("Présenté·e sur la slide « Formateur ». La fiche choisie donne aussi accès à la session au compte qui porte son adresse de connexion. ")}${admin ? `<a href="#/admin/formateurs">Gérer les fiches formateurs</a>` : T("Attribution faite par l'administration.")}</p>
        </div>
        <div class="card" style="margin-top:14px"><h3>Entreprise cliente</h3>
          <div class="brand-pick" id="gBrand">
            ${brands.map((b) => `<label class="brand-opt"><input type="radio" name="brand" value="${b.id}"${session.brand_id === b.id ? " checked" : ""}><span class="logo-tile">${b.logo || b.logo_light ? `<img src="${esc(b.logo || b.logo_light)}" alt="">` : T(b.name)}</span><small>${T(b.name)}</small></label>`).join("")}
            <label class="brand-opt"><input type="radio" name="brand" value=""${!session.brand_id ? " checked" : ""}><span class="logo-tile text">—</span><small>Autre</small></label>
          </div>
          <div id="otherFields">
            <label class="f" for="gC">Nom de l'entreprise</label><input type="text" id="gC" maxlength="80" value="${esc(session.client || "")}">
            <label class="f">Logo de l'entreprise</label>
            <div id="gLpair">${logoPair("sess", clientLogo, clientLogoLight)}</div>
          </div>
          <p class="small muted">${T("Les entreprises récurrentes et leurs logos se gèrent dans ")}<a href="#/admin/reglages">Réglages généraux</a>.</p>
        </div>
      </div>
      <div>
        <details class="card acc-set" name="regacc" data-acc="em" open><summary><h3>Émargement</h3></summary>
          <label class="f" for="gEm">Lien de l'outil d'émargement</label><input type="url" id="gEm" placeholder="https://…" value="${esc(session.emargement_url || "")}">
          <label class="f">ou image du QR code fourni par l'organisme</label><input type="file" id="gEq" accept="image/*">
          <div class="em2box">
            <label class="f inline"><input type="checkbox" id="gE2"${session.emargement2_enabled !== false ? " checked" : ""}> Afficher le second émargement (celui de l'entreprise)</label>
            <div id="e2fields">
              <label class="f" for="gEl">Nom du client (« Pour … »)</label><input type="text" id="gEl" maxlength="60" placeholder="Libé" value="${esc(session.emargement_label || "")}">
              <label class="f" for="gEt">Texte</label><textarea id="gEt" maxlength="300" placeholder="${esc(EM2_DEFAULT)}">${esc(session.emargement2_text || "")}</textarea>
              <p class="small muted">${T("Vides, ces champs reprennent le nom de l'entreprise et le texte par défaut. L'icône @ s'affiche sous le texte.")}</p>
            </div>
          </div>
          <div id="emPrev" style="margin-top:10px"></div>
        
        </details>
        <details class="card acc-set" name="regacc" data-acc="sl"><summary><h3>Slides projetées</h3></summary>
          <label class="f" for="gSl">Présentation Google Slides</label><input type="url" id="gSl" placeholder="https://docs.google.com/presentation/d/…" value="${esc(session.slides_url || "")}">
          <p class="small muted">${T("Appelées pendant les séquences « Comprendre » depuis l'onglet Jour J. L'écran projeté doit être ouvert dans un navigateur connecté à un compte Google qui a accès à la présentation : inutile de la rendre publique.")}</p>
          <label class="f" for="gSkip">Pages masquées</label><input type="text" id="gSkip" placeholder="ex. 12, 40 à 45" value="${esc(session.skip_pages || "")}">
          <p class="small muted" id="skipHelp">${T("Google Slides affiche quand même une slide masquée quand le pilotage l'appelle. Indiquez ici les numéros de page à sauter : ils disparaissent du pilotage et les flèches passent par-dessus.")}</p>
          <label class="f" style="margin-top:14px">Autres présentations à projeter</label>
          <p class="small muted" style="margin-top:0">${T("Google Slides ou PDF déposé sur Drive (lien « Partager »). Le PDF s'affiche dans la visionneuse Drive : on change de page directement sur l'écran projeté.")}</p>
          <div id="deckList"></div>
          <div class="askrow" style="margin-top:6px"><input type="text" id="dkT" maxlength="80" placeholder="Titre (ex. Étude de cas Ouest-France)"><input type="url" id="dkU" placeholder="Lien Google Slides ou fichier Drive"><button type="button" class="btn sm" id="dkAdd">Ajouter</button></div>
        
        </details>
        <details class="card acc-set" name="regacc" data-acc="ev"><summary><h3>Évaluation de fin de stage</h3></summary>
          <label class="f" for="gEvU">Lien du formulaire</label><input type="url" id="gEvU" placeholder="https://bit.ly/…" value="${esc(session.evaluation_url || "")}">
          <label class="f">ou image du QR code fourni</label><input type="file" id="gEvQ" accept="image/*">
          <div id="evPrev" style="margin-top:8px"></div>
          <label class="f" for="gEvT">Titre</label><input type="text" id="gEvT" maxlength="160" placeholder="${esc(EVAL_TITLE)}" value="${esc(session.evaluation_title || "")}">
          <label class="f" for="gEvX">Texte</label><textarea id="gEvX" maxlength="500" placeholder="${esc(EVAL_TEXT)}">${esc(session.evaluation_text || "")}</textarea>
          <p class="small muted">${T("Projetée depuis le pilotage (bouton « Évaluation » et créneau en fin de déroulé). Les stagiaires la retrouvent aussi au-dessus du téléchargement du support.")}</p>
        
        </details>
        <details class="card acc-set" name="regacc" data-acc="su"><summary><h3>Support à télécharger</h3></summary>
          <label class="f" for="gSu">Lien du support (PDF sur Drive, etc.)</label><input type="url" id="gSu" placeholder="https://…">
          <p class="small muted" id="supInfo"></p>
          <label class="f inline"><input type="checkbox" id="gSuF"${session.support_unlocked ? " checked" : ""}> Débloquer dès maintenant</label>
        
        </details>
        <button class="btn" type="submit" style="margin-top:14px;width:100%">Enregistrer les réglages</button>
      </div>
    </form>`;
    const drawDecks = () => {
      $("#deckList", box).innerHTML = decks.map((d, i) => `<div class="prow"><span><span class="pill">${deckKind(d.url) === "pdf" ? "PDF" : "Slides"}</span> ${T(d.title)}</span><button type="button" class="iconbtn danger" data-dk="${i}" aria-label="Retirer">✕</button></div>`).join("") || `<p class="small muted">Aucune.</p>`;
      $$("[data-dk]", box).forEach((b) => (b.onclick = () => { decks.splice(+b.dataset.dk, 1); drawDecks(); }));
    };
    drawDecks();
    $("#dkAdd", box).onclick = () => {
      // Tolérant : lien collé dans le champ du titre, espaces ou caractères invisibles autour du lien
      const clean = (v) => v.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
      let url = clean($("#dkU", box).value), title = clean($("#dkT", box).value);
      const inTitle = title.match(/https?:\/\/\S+/);
      if (!deckKind(url) && inTitle) { url = inTitle[0]; title = title.replace(inTitle[0], "").trim(); }
      else { const m = url.match(/https?:\/\/\S+/); if (m) url = m[0]; }
      title = title || "Présentation";
      if (!url) return toast("Collez le lien de la présentation dans le second champ (le premier sert au titre).", "ko");
      if (!deckKind(url)) return toast("Lien non reconnu : collez un lien Google Slides (docs.google.com/presentation/…) ou un lien de fichier Drive (drive.google.com/file/…).", "ko");
      decks.push({ id: "d" + Date.now().toString(36), title, url }); $("#dkU", box).value = ""; $("#dkT", box).value = ""; drawDecks();
      toast("Ajoutée : pensez à enregistrer les réglages.");
    };
    // Champs « Autre » : visibles seulement sans entreprise préenregistrée
    const syncBrand = () => ($("#otherFields", box).hidden = !!box.querySelector('input[name="brand"]:checked')?.value);
    box.querySelectorAll('input[name="brand"]').forEach((r) => (r.onchange = syncBrand)); syncBrand();
    // Accordéons : un seul ouvert à la fois (repli JS si l'attribut name n'est pas géré)
    $$("details.acc-set", box).forEach((d) => d.addEventListener("toggle", () => { if (d.open) $$("details.acc-set", box).forEach((o) => o !== d && (o.open = false)); }));
    const syncE2 = () => ($("#e2fields", box).style.display = $("#gE2", box).checked ? "" : "none");
    $("#gE2", box).onchange = syncE2; syncE2();
    const drawEv = async () => {
      const q = await evaluationQr({ evaluation_qr: evQr, evaluation_url: $("#gEvU", box).value.trim() }, 600);
      $("#evPrev", box).innerHTML = q ? `<img src="${q}" alt="QR de l'évaluation" class="thumb lg"><div class="chips" style="margin-top:6px"><a class="btn sm ghost" href="${q}" download="evaluation-${esc(session.code)}.png">Télécharger le QR (PNG)</a>${evQr ? `<button type="button" class="linkbtn small" id="evDel">Retirer l'image</button>` : ""}</div>` : "";
      $("#evDel", box)?.addEventListener("click", () => { evQr = null; drawEv(); });
    };
    $("#gEvU", box).oninput = debounce(drawEv, 400); drawEv();
    $("#gEvQ", box).onchange = async (e) => { const f = e.target.files[0]; if (f) { evQr = await guard(() => fileToDataUrl(f, 800)) || evQr; drawEv(); } };
    const fmt = () => box.querySelector('input[name="fmt"]:checked')?.value || session.format || "1";
    const syncD2 = () => ($("#d2wrap", box).style.visibility = fmt() === "2" ? "visible" : "hidden");
    box.querySelectorAll('input[name="fmt"]').forEach((r) => (r.onchange = syncD2)); syncD2();
    const drawEm = async () => {
      const qrUrl2 = await emargementQr({ emargement_qr: emQr, emargement_url: $("#gEm", box).value.trim() }, 600);
      $("#emPrev", box).innerHTML = qrUrl2 ? `<img src="${qrUrl2}" alt="QR d'émargement" class="thumb lg"><div class="chips" style="margin-top:6px"><a class="btn sm ghost" href="${qrUrl2}" download="emargement-${esc(session.code)}.png">Télécharger le QR (PNG)</a>${emQr ? `<button type="button" class="linkbtn small" id="emDel">Retirer l'image</button>` : ""}</div>` : `<p class="small muted">Aucun émargement configuré.</p>`;
      $("#emDel", box)?.addEventListener("click", () => { emQr = null; drawEm(); });
    };
    $("#gEm", box).oninput = debounce(drawEm, 400); drawEm();
    $("#gEq", box).onchange = async (e) => { const f = e.target.files[0]; if (f) { emQr = await guard(() => fileToDataUrl(f, 800)) || emQr; drawEm(); } };
    const bindPair = () => {
      $$("#gLpair [data-up]", box).forEach((inp) => (inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const url = await guard(() => fileToDataUrl(f)); if (!url) return;
        if (inp.dataset.kind === "dark") clientLogo = url; else clientLogoLight = url;
        $("#gLpair", box).innerHTML = logoPair("sess", clientLogo, clientLogoLight); bindPair();
      }));
      $$("#gLpair [data-rm]", box).forEach((b) => (b.onclick = () => {
        if (b.dataset.kind === "dark") clientLogo = null; else clientLogoLight = null;
        $("#gLpair", box).innerHTML = logoPair("sess", clientLogo, clientLogoLight); bindPair();
      }));
    };
    bindPair();
    if (sup.url) $("#gSu", box).value = sup.url;
    const supInfo = (st) => (st.unlock_at ? T(`Téléchargeable par les stagiaires à partir du ${new Date(st.unlock_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })} (une heure avant la fin). La page Support reste visible dans leur menu.`) : T("Renseignez la date et l'heure de fin pour programmer le déblocage."));
    $("#supInfo", box).innerHTML = supInfo(sup);
    bindConducteur();
    keepDraft($("#regF", box), `reglages:${sid}`, { saveLabel: "Enregistrer les réglages" }); // brouillon automatique + « Tout réinitialiser »
    $("#regF", box).onsubmit = async (e) => {
      e.preventDefault();
      const format = fmt();
      if (format === "2" && !$("#gD2", box).value) return toast("Indiquez la date du jour 2.", "ko");
      const patch = {
        title: $("#gT", box).value.trim(), formation: $("#gF", box).value.trim() || "Prendre en main les IA génératives",
        format, date: $("#gD1", box).value || null, date2: format === "2" ? $("#gD2", box).value || null : null,
        start_time: $("#gS", box).value || "09:30", end_time: $("#gE", box).value || "17:30",
        brand_id: box.querySelector('input[name="brand"]:checked')?.value || null, ...(admin ? { trainer_id: $("#gTr", box).value || null, skin_id: $("#gSk", box).value || null } : {}),
        emargement_url: $("#gEm", box).value.trim() || null, emargement_qr: emQr, emargement_label: $("#gEl", box).value.trim() || null,
        emargement2_enabled: $("#gE2", box).checked, emargement2_text: $("#gEt", box).value.trim() || null,
        slides_url: $("#gSl", box).value.trim() || null, skip_pages: formatPages(parsePages($("#gSkip", box).value)), support_unlocked: $("#gSuF", box).checked, decks,
        evaluation_url: $("#gEvU", box).value.trim() || null, evaluation_qr: evQr,
        evaluation_title: $("#gEvT", box).value.trim() || null, evaluation_text: $("#gEvX", box).value.trim() || null,
      };
      if (patch.slides_url && !deckId(patch.slides_url)) return toast("Lien Google Slides non reconnu.", "ko");
      if (patch.evaluation_url && !/^https?:\/\//i.test(patch.evaluation_url)) return toast("Le lien de l'évaluation doit commencer par https://", "ko");
      // Entreprise préenregistrée : ses nom et logos viennent des réglages généraux
      Object.assign(patch, patch.brand_id ? { client: "", client_logo: null, client_logo_light: null } : { client: $("#gC", box).value.trim(), client_logo: clientLogo, client_logo_light: clientLogoLight });
      const fmtChanged = format !== session.format;
      if (fmtChanged) patch.activities = defaultActivities(format);
      const saved = await guard(() => api.updateSession(sid, patch));
      if (!saved) return;
      session = saved;
      applySkin(skinFor(session, skinData.skins, skinData.def)); // l'habillage choisi s'applique aussitôt
      const kk = document.querySelector(".brand-wrap .kicker"); if (kk) kk.textContent = `Espace formation · ${currentSkin()?.name || "Journalisme & IA"}`;
      document.querySelector(".brand-wrap > :first-child")?.replaceWith(Object.assign(document.createElement("span"), { innerHTML: samsaHtml(true, "head") }).firstElementChild);
      await guard(() => api.setSupport(sid, $("#gSu", box).value.trim() || null));
      const st = await api.supportStatus(sid).catch(() => ({}));
      $("#supInfo", box).innerHTML = supInfo(st);
      toast(fmtChanged ? "Réglages enregistrés : déroulé et activités adaptés au nouveau format." : "Réglages enregistrés.", "ok");
    };
  }

  /* Conducteur : import d'un fichier Markdown, aperçu, application, export, retour au déroulé par défaut */
  function bindConducteur() {
    const imported = session.programme?.modules?.length;
    const mods = modulesFor(session), D = daysOf(session);
    $("#condSrc", box).innerHTML = T(imported
      ? `Conducteur importé${session.programme.name ? ` (${session.programme.name})` : ""} : ${mods.filter((m) => m.type !== "pause").length} séquences sur ${D.n} journée${D.n > 1 ? "s" : ""}. Le format suit le conducteur.`
      : `Déroulé par défaut de la formation en ${session.format === "2" ? "deux journées" : "une journée"}. Importez un fichier .md pour le remplacer.`);
    $("#condExport", box).onclick = () => download(`conducteur-${(session.code || "session").toLowerCase()}.md`,
      conducteurMarkdown(mods, { formation: session.programme?.formation || session.formation, days: D.titles }), "text/markdown;charset=utf-8");
    $("#condReset", box).onclick = async () => {
      if (!confirm("Revenir au déroulé par défaut ? Le conducteur importé sera retiré de cette session.")) return;
      if (await guard(() => api.updateSession(sid, { programme: null }), "Déroulé par défaut rétabli.")) go(location.hash);
    };
    $("#condFile", box).onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      if (f.size > 300000) return toast("Fichier trop lourd pour un conducteur (300 Ko au plus).", "ko");
      const { programme, warnings, errors } = parseConducteur(await f.text());
      programme.name = f.name;
      const rows = programme.modules.map((m) => `<tr><td class="mono small">${programme.nDays > 1 ? `J${m.day} · ` : ""}${m.t[0]}–${m.t[1]}</td><td><span class="pill ${m.type}">${typeLabel(m.type)}</span></td><td>${T(m.titre)}${m.cas ? `<div class="small muted">${T(m.cas)}</div>` : ""}</td><td class="small muted">${[m.obj && "objectifs", m.pts && "points clés", m.disc && "discussion", m.exo && `exercice ${m.exo.duree} min`, m.quiz && "quiz", m.live && "activité"].filter(Boolean).join(" · ")}</td></tr>`).join("");
      $("#condPrev", box).innerHTML = `<div class="cond-prev">
        <h4>Aperçu de « ${esc(f.name)} »</h4>
        ${errors.length ? `<div class="warn small"><b>${errors.length} erreur${errors.length > 1 ? "s" : ""} à corriger avant d'appliquer :</b><ul>${errors.map((x) => `<li>${T(x)}</li>`).join("")}</ul></div>` : ""}
        ${warnings.length ? `<details class="small cond-warn"><summary>${warnings.length} remarque${warnings.length > 1 ? "s" : ""} (sans blocage)</summary><ul>${warnings.map((x) => `<li>${T(x)}</li>`).join("")}</ul></details>` : ""}
        ${programme.modules.length ? `<div class="cond-table"><table class="tbl small"><thead><tr><th>Horaires</th><th>Type</th><th>Séquence</th><th>Contenu</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn sm" id="condApply"${errors.length ? " disabled" : ""}>Appliquer ce conducteur (${programme.nDays} journée${programme.nDays > 1 ? "s" : ""})</button>
          <button type="button" class="btn sm ghost" id="condCancel">Annuler</button>
        </div></div>`;
      $("#condCancel", box).onclick = () => ($("#condPrev", box).innerHTML = "");
      $("#condApply", box).onclick = async () => {
        const format = programme.nDays > 1 ? "2" : "1";
        if (format === "2" && !session.date2) toast("Pensez à indiquer la date du jour 2.", "info");
        const patch = { programme, format };
        if (session.live?.module && !programme.modules.some((m) => m.id === session.live.module)) patch.live = { ...session.live, module: null };
        if (await guard(() => api.updateSession(sid, patch), "Conducteur appliqué : déroulé, parcours stagiaire et pilotage sont à jour.")) go(location.hash);
      };
    };
  }

  /* =================================================================
     AVANT
     ================================================================= */
  async function phaseAvant() {
    const draw = async () => {
      const [invites, roster] = await Promise.all([api.listInvites(sid), api.roster(sid)]);
      const joined = new Set(roster.map((r) => r.email));
      box.innerHTML = `
      <div class="grid adm2">
        <div>
          <div class="card">
            <h3>Participant·es (${roster.length})</h3>
            ${hasCadrage(session) ? `<p class="small muted" style="margin-top:0">${roster.filter((r) => r.project_status === "validated").length} cadrage(s) validé(s) · ${roster.filter((r) => r.project_id && r.project_status !== "validated").length} en cours</p>` : `<p class="small muted" style="margin-top:0">${T("Formation d'une journée : pas de cadrage de cas d'usage en amont.")}</p>`}
            ${roster.length ? `<table class="tbl"><thead><tr><th>Nom</th><th>Profil</th>${hasCadrage(session) ? "<th>Cadrage</th>" : ""}<th></th></tr></thead><tbody>${roster.map((r) => `<tr>
              <td><b>${T(r.full_name || "—")}</b><div class="small muted">${esc(r.email)}</div></td>
              <td class="small">${T(r.metier || "—")}<div class="muted">${T(r.niveau || "")}</div></td>
              ${hasCadrage(session) ? `<td>${r.project_status === "validated" ? `<span class="tag ok">✓ Validé</span>` : r.project_id ? `<span class="tag">${r.project_steps}/${STEPS.length} · commencé</span>` : `<span class="small muted">Pas commencé</span>`}${r.project_title ? `<div class="small">${T(r.project_title)}</div>` : ""}</td>` : ""}
              <td class="actions">${r.project_id && hasCadrage(session) ? `<button class="btn sm ghost" data-proj="${r.project_id}">Voir et commenter</button>` : ""}<button class="iconbtn danger" data-rm="${r.user_id}" title="Retirer de la session" aria-label="Retirer">✕</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">Personne n'a encore rejoint la session.</p>`}
          </div>
          <div class="card" style="margin-top:14px">
            <h3>Invitations par e-mail</h3>
            <p class="small muted" style="margin-top:0">${T("La personne invitée retrouve la session dès sa première connexion avec cette adresse. Aucun e-mail n'est envoyé par la plateforme : transmettez le lien de connexion vous-même.")}</p>
            <form id="invF"><textarea id="invT" placeholder="Une adresse par ligne"></textarea><button class="btn sm" type="submit" style="margin-top:8px">Ajouter</button></form>
            <div class="chips" style="margin-top:10px">${invites.map((i) => `<span class="chip">${esc(i.email)} ${joined.has(i.email) ? "✓" : ""}<button class="linkbtn" data-uninv="${esc(i.email)}" aria-label="Retirer l'invitation">✕</button></span>`).join("") || `<span class="small muted">Aucune invitation.</span>`}</div>
          </div>
        </div>
        <div>
          <div class="card qrcard"><img src="${qrUrl}" alt="QR code de la session"><div class="small" style="margin:6px 0">Lien à transmettre :</div><div class="mono linkbox" id="jl">${esc(joinUrlLabel(session.code))}</div>
            <div class="chips" style="justify-content:center;margin-top:8px"><button class="btn sm ghost" id="cpL">Copier le lien</button><button class="btn sm ghost" id="fsQ">Afficher en plein écran</button></div></div>
        </div>
      </div>`;
      $("#invF", box).onsubmit = async (e) => { e.preventDefault(); const em = parseEmails($("#invT", box).value); if (!em.length) return toast("Aucune adresse valide.", "ko"); await guard(() => api.addInvites(sid, em), `${em.length} invitation(s) ajoutée(s).`); draw(); };
      $$("[data-uninv]", box).forEach((b) => (b.onclick = async () => { await guard(() => api.removeInvite(sid, b.dataset.uninv)); draw(); }));
      $$("[data-rm]", box).forEach((b) => (b.onclick = async () => { if (confirm("Retirer cette personne de la session ? Son cadrage reste enregistré.")) { await guard(() => api.removeMember(sid, b.dataset.rm)); draw(); } }));
      $$("[data-proj]", box).forEach((b) => (b.onclick = () => openProject(b.dataset.proj, roster, draw)));
      $("#cpL", box).onclick = (e) => copyText(joinUrl(session.code), e.target);
      $("#fsQ", box).onclick = async () => showQr(session, await qr(joinUrl(session.code), 900));
    };
    await draw();
    cleanups.push(api.watch(sid, debounce((e) => { if (["session_members", "projects", "*"].includes(e.table) && !box.contains(document.activeElement)) draw(); }, 600)));
  }

  // Panneau : cadrage complet d'un·e stagiaire, avec retour du formateur
  async function openProject(pid, roster, after) {
    const p = (await api.listProjects(sid)).find((x) => x.id === pid);
    if (!p) return;
    const r = roster.find((x) => x.user_id === p.user_id) || {};
    const d = p.data || {}, a = d.analyse || {};
    openSheet(`<span class="pill">${p.status === "validated" ? "Cadrage validé" : "Cadrage en cours"}</span>
      <h2>${T(d.retenu?.titre || "Sans titre")}</h2>
      <p class="small muted">${T(r.full_name || r.email || "")} · ${T(r.metier || "")} · ${T(r.niveau || "")}</p>
      <div class="sec"><h4>Besoin</h4><p style="margin:0;white-space:pre-wrap">${T(d.besoin || "—")}</p>${d.pourqui ? `<p class="small">Pour : ${T(d.pourqui)}</p>` : ""}</div>
      <div class="sec"><h4>Cas retenu</h4><p style="margin:0;white-space:pre-wrap">${T(d.retenu?.description || "—")}</p>
        <p class="small">Outil : ${T(d.retenu?.outil || "—")} · Documents : ${T(d.retenu?.donnees || "—")} · Code couleur : <b>${T(SENSIB.find((s) => s[0] === d.retenu?.sensibilite)?.[1] || "—")}</b></p></div>
      ${d.verif ? `<div class="sec"><h4>Points de vigilance</h4><ul class="small" style="margin:0;padding-left:18px">${VERIF.map(([k, l]) => `<li>${d.verif[k] ? "✓" : "○"} ${T(l)}</li>`).join("")}</ul>${d.verif.consigne ? `<h4 style="margin-top:10px">Première consigne</h4><div class="analysis small">${T(d.verif.consigne)}</div>` : ""}</div>` : ""}
      ${a.v1 ? `<div class="sec"><h4>Analyse (ancienne version)</h4><div class="analysis small">${T(a.v2 || a.v1)}</div></div>` : ""}
      ${p.question ? `<div class="sec disc"><h4>Question au formateur</h4><p style="margin:0">${T(p.question)}</p></div>` : ""}
      <div class="sec"><h4>Votre retour</h4><textarea id="fbT" maxlength="4000" style="min-height:110px">${esc(p.trainer_comment || "")}</textarea><button class="btn sm" id="fbS" style="margin-top:8px">Envoyer le retour</button></div>`);
    $("#fbS").onclick = async () => { await guard(() => api.commentProject(pid, $("#fbT").value.trim()), "Retour enregistré : la personne le verra en haut de son cadrage."); after?.(); };
  }

  /* =================================================================
     JOUR J
     ================================================================= */
  async function phaseJour() {
    box.innerHTML = `
      <div class="grid jour2">
        <div>
          <div class="card">
            <h3>Pilotage</h3>
            <p class="small muted" id="hint" style="margin-top:0"></p>
            <div id="emRemind"></div>
            <div class="kicker-d" style="margin:10px 0 6px">Écrans de la session · ouverture et clôture</div>
            <div class="acts" id="opening"></div>
            <div class="kicker-d" style="margin:16px 0 6px">Déroulé · ce que voient les stagiaires et l'écran</div>
            <div id="modules"></div>
            <div id="decksBox"></div>
            <div class="kicker-d" style="margin:16px 0 6px">Activités en direct</div>
            <div class="acts" id="acts"></div>
            <div id="ctrl" style="margin:12px 0"></div>
            <details style="margin-top:14px"><summary class="small" style="cursor:pointer">Ajouter ou retirer des activités</summary><div id="actEdit"></div></details>
            <hr><label class="f inline"><input type="checkbox" id="closeDay"${session.status === "closed" ? " checked" : ""}> Clore la journée (les stagiaires gardent ressources, fiches, exercices et support ; discussion, émargement et déroulé se ferment)</label>
            <div class="reset-live"><button type="button" class="btn sm ghost" id="resetLive">Remettre le direct à zéro</button>
              <span class="small muted">${T("Après des essais : ferme la salle, efface la séquence lancée, les outils débloqués, les émargements projetés et l'heure d'ouverture du jour. Inscrit·es, réponses et discussion ne bougent pas.")}</span></div>
          </div>
          <div class="card" style="margin-top:14px"><h3 id="pTitle">Participant·es</h3><div id="plist"></div></div>
        </div>
        <aside class="jour-side">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="kicker-d live-tag"><span class="dot on"></span>Écran projeté · en direct</div><button class="btn sm" id="openScr">Ouvrir l'écran projeté</button></div>
          <div id="preview" class="preview"></div>
          <div id="nextBox" class="next-box" hidden><div class="kicker-d">À suivre · <span id="nextLbl"></span></div><div id="nextPrev" class="preview"></div></div>
          <div class="card chat-card" style="margin-top:14px"><h3>Discussion des stagiaires</h3><div id="chatAdm"></div></div>
        </aside>
      </div>`;
    cleanups.push(mountChat($("#chatAdm", box), { api, sid, me: ctx.me, staff: true, compact: true }));
    $("#openScr", box).onclick = () => window.open(`#/ecran/${sid}`, "ecran-" + sid, "popup=yes,width=1280,height=760");
    afterLive = () => draw(); // bascule du QR code de l'en-tête : l'aperçu suit
    // Remise à zéro du direct (après des essais) : salle fermée, état diffusé vidé ; rien d'autre n'est touché
    $("#resetLive", box).onclick = async () => {
      if (!confirm("Remettre le direct à zéro ?\n\nLa salle sera fermée. La séquence lancée, les outils d'exercice débloqués, les émargements déjà projetés et l'heure d'ouverture du jour seront effacés. Les inscrit·es, les réponses et la discussion sont conservés.")) return;
      session = await guard(() => api.updateSession(sid, { status: "draft", live: {} }), "Direct remis à zéro : salle fermée.") || session;
      go(location.hash); // l'en-tête (horloge, bouton de la salle) suit
    };
    $("#closeDay", box).onchange = async (e) => { session = await guard(() => api.updateSession(sid, e.target.checked ? { status: "closed", live: {} } : { status: "live", live: { ...(session.live || {}), started: stamp(session.live) } }), e.target.checked ? "Journée close." : "Session rouverte.") || session; draw(); };

    // Outils d'exercice débloqués : on ajoute celui de la séquence lancée, sans jamais en retirer
    const withTools = (live) => {
      const m = live.module ? modulesFor(session).find((x) => x.id === live.module) : null;
      return { ...live, tools: [...new Set([...(session.live?.tools || []), ...(live.tools || []), ...(m?.outil ? [m.outil] : [])])] };
    };
    const setLive = async (live, extra = {}) => {
      live = withTools(live);
      if (session.status !== "live") { if (!confirm("La salle est fermée. L'ouvrir et lancer l'activité ?")) return; }
      session = await guard(() => api.updateSession(sid, { status: "live", live: { ...live, started: stamp(session.live) }, ...extra })) || session;
      draw();
    };
    // la séquence en cours et les émargements déjà présentés survivent à chaque changement d'écran
    // (et l'heure de première ouverture du jour, sinon projeter un écran d'ouverture salle fermée la perdait, et la remise à zéro du minuteur)
    const keep = () => ({ module: session.live?.module || null, emarg: session.live?.emarg || {}, tools: session.live?.tools || [], ...(session.live?.started ? { started: session.live.started } : {}), ...(session.live?.clock ? { clock: session.live.clock } : {}) });
    // Écrans d'ouverture et de clôture : projetables salle fermée, sans l'ouvrir. Les stagiaires ne les voient
    // dans leur espace qu'une fois la salle ouverte (session active).
    const show = async (view, extra = {}) => {
      const live = { ...keep(), view, ...extra, started_at: new Date().toISOString() };
      if (session.status !== "live" && (view === null || OPENING_VIEWS.has(view))) {
        session = await guard(() => api.updateSession(sid, { live })) || session;
        return draw();
      }
      return setLive(live);
    };
    let modDay = 1;
    // Flèches du clavier (et télécommandes de présentation) : page suivante / précédente
    const onKey = (e) => {
      const dir = pageKey(e); if (!dir) return;
      const nl = stepLive(session, dir); if (!nl) return;
      e.preventDefault(); setLive(nl);
    };
    document.addEventListener("keydown", onKey); cleanups.push(() => document.removeEventListener("keydown", onKey));
    const launch = async (act) => {
      const live = { ...keep(), view: "activity", act: act.id, qi: 0, reveal: false, started_at: new Date().toISOString() };
      if (act.type === "vote") {
        const [ps, roster] = await Promise.all([api.listProjects(sid), api.roster(sid)]);
        const by = Object.fromEntries(roster.map((r) => [r.user_id, r]));
        const val = ps.filter((p) => p.status === "validated" && p.data?.retenu?.titre);
        live.options = (val.length ? val : ps.filter((p) => p.data?.retenu?.titre)).slice(0, 12).map((p) => ({ id: p.id, titre: p.data.retenu.titre, auteur: by[p.user_id] ? firstName(by[p.user_id]) : "" }));
        if (!live.options.length) toast("Aucun cas d'usage cadré : le vote sera vide.", "ko");
        // les options sont aussi gardées dans l'activité, pour relire les résultats après coup
        return setLive(live, { activities: session.activities.map((a) => (a.id === act.id ? { ...a, options: live.options } : a)) });
      }
      setLive(live);
    };

    const draw = async () => {
      session = (await api.getSession(sid)) || session;
      const act = currentAct(session), live = session.live || {};
      tick(); // horloge de l'en-tête : suit tout de suite l'ouverture ou la fermeture de la salle
      $("#hint", box).textContent = session.status === "live" ? "La salle est ouverte. Chaque clic change l'écran projeté et ce que voient les stagiaires dans leur espace." : "La salle est fermée : les écrans d'ouverture et de clôture se projettent sans l'ouvrir, les stagiaires ne les verront qu'à l'ouverture de la salle. Lancer une séquence ou une activité ouvre la salle.";
      const V = session.status === "live" || OPENING_VIEWS.has(live.view) ? live.view : null;
      $("#opening", box).innerHTML = [["title", "Slide de titre", "Titre, logos, dates, QR"], ["emargement", "Émargement", session.emargement_url || session.emargement_qr ? "QR de l'organisme" : "À configurer"], ["trainer", "Formateur", session.trainer_id ? "Fiche de l'intervenant" : "À choisir"], ["support", "Support", "Annonce du téléchargement"], ["evaluation", "Évaluation", session.evaluation_url || session.evaluation_qr ? "QR et lien du formulaire" : "À configurer"], ["", "Écran d'attente", "Rien de projeté"]]
        .map(([v, l, sub]) => `<button class="act${(V || "") === v && !act ? " on" : ""}" data-view="${v}"><span>${v ? "▣" : "□"}</span>${l}<small>${T(sub)}</small></button>`).join("");
      $$("[data-view]", box).forEach((b) => (b.onclick = () => {
        // Écran « Formateur » sans fiche choisie : on prévient au lieu de projeter une slide vide
        if (b.dataset.view === "trainer" && !session.trainer_id) return toast("Aucune fiche intervenant n'est enregistrée pour cette session : choisissez-la dans Réglages → Intervenant·e, puis enregistrez.", "ko");
        return show(b.dataset.view || null);
      }));
      // Émargements : arrivée du matin (début de journée) et reprise de l'après-midi (fin du déjeuner)
      const slots = emargementSlots(session);
      const emDone = live.emarg || {};
      const showEm = (k) => show(k.endsWith("-eval") ? "evaluation" : "emargement", { emKey: k, emarg: { ...emDone, [k]: new Date().toISOString() } });
      // Rappel : de 15 min avant à 30 min après l'heure prévue, le jour J
      const nowD = new Date(), today = nowD.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
      const nowM = mins(nowD.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
      const due = slots.find((x) => !emDone[x.key] && x.date === today && nowM >= mins(x.t) - 15 && nowM <= mins(x.t) + 30);
      $("#emRemind", box).innerHTML = due ? `<div class="remind"><b>${T(`${due.label} · ${hhmmT(due.t)}`)}</b><span>${T("C'est le moment de projeter le QR code d'émargement.")}</span><button class="btn sm" data-em="${due.key}">Projeter l'émargement</button></div>` : "";
      // Déroulé : séquence courante + slides Drive des séquences qui en ont
      const mods = modulesFor(session).filter((m) => m.type !== "pause");
      const cur = mods.find((m) => m.id === live.module);
      if (cur?.day) modDay = cur.day;
      const shown = mods.filter((m) => session.format !== "2" || (m.day || 1) === modDay);
      const skip = skipSet(session), hidden = (m) => parsePages(m.pages).filter((p) => skip.has(p)).length; // pages masquées de la séquence
      $("#modules", box).innerHTML = `${session.format === "2" ? `<div class="days" style="margin:0 0 8px">${[1, 2].map((d) => `<button type="button" data-mday="${d}" aria-pressed="${d === modDay}">Jour ${d}</button>`).join("")}</div>` : ""}
        <div class="modlist">${interleave(shown, slots.filter((x) => session.format !== "2" || x.day === modDay)).map((m) => {
          if (m.slot) return `<div class="modrow em${emDone[m.key] ? " done" : ""}${(V === "emargement" || V === "evaluation") && live.emKey === m.key ? " on" : ""}"><button type="button" data-em="${m.key}"><span class="mono small">${hhmmT(m.t)}</span><span class="pill tf">${m.kind === "evaluation" ? "Évaluation" : "Émargement"}</span><b>${T(m.label)}</b>${emDone[m.key] ? `<span class="small muted" style="margin-left:auto">✓ présenté à ${new Date(emDone[m.key]).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}</button></div>`;
          const on = m.id === live.module, pages = modPages(session, m);
          return `<div class="modrow${on ? " on" : ""}"><button type="button" data-mod="${m.id}"><span class="mono small">${hhmmT(m.t[0])}</span><span class="pill ${m.type}">${T(typeLabel(m.type))}</span><span class="modtxt"><b>${T(m.titre)}</b>${m.cas ? `<small>${T(m.cas)}</small>` : ""}</span></button>
            ${on && pages.length && session.slides_url ? `<div class="slidebar"><button type="button" class="iconbtn" data-sl="prev" aria-label="Page précédente">←</button>${pages.map((p) => `<button type="button" class="chip${V === "slide" && live.slide === p ? " on" : ""}" data-page="${p}">${p}</button>`).join("")}<button type="button" class="iconbtn" data-sl="next" aria-label="Page suivante">→</button>${hidden(m) ? `<span class="small muted" title="Réglages → Slides projetées">${hidden(m)} masquée${hidden(m) > 1 ? "s" : ""}</span>` : ""}</div>` : ""}
            ${on && pages.length && !session.slides_url ? `<div class="small muted" style="padding:4px 8px">Pages ${T(m.pages)} · associez la présentation dans l'onglet Réglages pour les projeter.</div>` : ""}</div>`;
        }).join("")}</div>`;
      $$("[data-mday]", box).forEach((b) => (b.onclick = () => { modDay = +b.dataset.mday; draw(); }));
      $$("[data-em]", box).forEach((b) => (b.onclick = () => showEm(b.dataset.em)));
      $$("[data-mod]", box).forEach((b) => (b.onclick = () => setLive({ ...keep(), module: b.dataset.mod, view: "module", started_at: new Date().toISOString() })));
      const pages = modPages(session, cur);
      const goPage = (p) => setLive({ ...keep(), module: cur.id, view: "slide", slide: p, started_at: new Date().toISOString() });
      $$("[data-page]", box).forEach((b) => (b.onclick = () => goPage(+b.dataset.page)));
      // ← → : même règle que les flèches du clavier (au bout de la séquence, on passe à la voisine)
      $$("[data-sl]", box).forEach((b) => (b.onclick = () => {
        const nl = stepLive(session, b.dataset.sl === "next" ? 1 : -1);
        if (nl) setLive(nl); else if (V !== "slide" && pages.length) goPage(pages[0]);
      }));
      // Présentations supplémentaires (Google Slides ou PDF Drive)
      const decks = session.decks || [];
      $("#decksBox", box).innerHTML = decks.length ? `<div class="kicker-d" style="margin:16px 0 6px">Présentations</div><div class="modlist">${decks.map((d) => {
        const on = V === "deck" && live.deck === d.id, k = deckKind(d.url);
        return `<div class="modrow${on ? " on" : ""}"><button type="button" data-deck="${d.id}"><span class="pill">${k === "pdf" ? "PDF" : "Slides"}</span><b>${T(d.title)}</b></button>
          ${on && k === "slides" ? `<div class="slidebar"><button type="button" class="iconbtn" data-dp="-1" aria-label="Page précédente">←</button><span class="mono small">page ${live.page || 1}</span><button type="button" class="iconbtn" data-dp="1" aria-label="Page suivante">→</button></div>` : ""}
          ${on && k === "pdf" ? `<div class="small muted" style="padding:2px 10px 8px">${T("Changez de page directement sur l'écran projeté (visionneuse Drive).")}</div>` : ""}</div>`;
      }).join("")}</div>` : "";
      $$("[data-deck]", box).forEach((b) => (b.onclick = () => show("deck", { deck: b.dataset.deck, page: 1 })));
      $$("[data-dp]", box).forEach((b) => (b.onclick = () => show("deck", { deck: live.deck, page: Math.max(1, (live.page || 1) + +b.dataset.dp) })));
      $("#acts", box).innerHTML = session.activities.map((a, i) => `<button class="act${act?.id === a.id ? " on" : ""}" data-a="${esc(a.id)}"><span>${i + 1}</span>${T(a.titre)}<small>${ACT_TYPES[a.type]}</small></button>`).join("");
      $$("[data-a]", box).forEach((b) => (b.onclick = () => launch(session.activities.find((a) => a.id === b.dataset.a))));
      let c = "";
      if (act) {
        const desc = { welcome: "Accueil affiché à l'écran, avec le QR code.", cloud: "Ils envoient leurs mots ; le nuage se forme à l'écran.", poll: "Ils répondent au sondage ; les résultats s'affichent à l'écran.", quiz: "Ils répondent ; affichez la bonne réponse quand tout le monde a voté.", vote: "Ils votent pour un cas d'usage.", projects: "Les cas d'usage validés défilent à l'écran." }[act.type];
        c = `<p class="small" style="margin:0 0 8px">${T(desc)}</p><div class="chips">`;
        if (act.type === "quiz") {
          const n = QUIZ[act.quiz].q.length, qi = live.qi || 0;
          c += `<button class="btn sm ghost" data-q="-1" ${qi === 0 ? "disabled" : ""}>← Question précédente</button>
            <button class="btn sm" data-rev ${live.reveal ? "disabled" : ""}>Afficher la réponse</button>
            <button class="btn sm ghost" data-q="1" ${qi >= n - 1 ? "disabled" : ""}>Question suivante →</button>`;
        }
        const i = session.activities.findIndex((a) => a.id === act.id);
        if (session.activities[i + 1]) c += `<button class="btn sm ghost" data-next>Activité suivante : ${T(session.activities[i + 1].titre)}</button>`;
        c += `<button class="btn sm ghost" data-stop>Arrêter l'activité</button></div>`;
      }
      $("#ctrl", box).innerHTML = c;
      $$("[data-q]", box).forEach((b) => (b.onclick = () => setLive({ ...live, qi: (live.qi || 0) + +b.dataset.q, reveal: false })));
      $("[data-rev]", box)?.addEventListener("click", () => setLive({ ...live, reveal: true }));
      $("[data-next]", box)?.addEventListener("click", () => launch(session.activities[session.activities.findIndex((a) => a.id === act.id) + 1]));
      $("[data-stop]", box)?.addEventListener("click", () => setLive({ ...keep(), view: live.module ? "module" : null }));
      const sd = await loadScreenData(api, session);
      morph($("#preview", box), screenHtml({ ...sd, session, qrUrl, joinLabel: joinUrlLabel(session.code) }, true)); // sans clignotement
      // Aperçu de la page suivante (pour le formateur seulement)
      const nx = nextPage(session);
      $("#nextBox", box).hidden = !nx;
      if (nx) { $("#nextLbl", box).textContent = fr(nx.label); morph($("#nextPrev", box), nx.src ? `<div class="deck-slide frame compact"><iframe src="${esc(nx.src)}" title="Page suivante" tabindex="-1"></iframe></div>` : ""); }
      const roster = await api.roster(sid);
      $("#pTitle", box).textContent = `Participant·es (${roster.length})`;
      $("#plist", box).innerHTML = roster.map((r) => `<div class="prow"><span>${T(r.full_name || r.email)}</span>${r.project_status === "validated" ? `<span class="tag ok">✓ Cadrage</span>` : r.project_id ? `<span class="tag">${r.project_steps}/${STEPS.length}</span>` : `<span class="tag muted">—</span>`}</div>`).join("") || `<p class="small muted">Personne pour l'instant. Projetez le QR code.</p>`;
      drawEdit();
    };
    const drawEdit = () => {
      $("#actEdit", box).innerHTML = `
        ${session.activities.map((a, i) => `<div class="prow"><span>${i + 1}. ${T(a.titre)} <small class="muted">${ACT_TYPES[a.type]}</small></span><span><button class="iconbtn" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button><button class="iconbtn danger" data-drop="${i}" aria-label="Retirer">✕</button></span></div>`).join("")}
        <form id="addA" class="card" style="margin-top:10px;background:var(--light)">
          <div class="grid g2"><div><label class="f">Type</label><select id="aT"><option value="poll">Sondage</option><option value="cloud">Nuage de mots</option>${Object.entries(QUIZ).map(([k, q]) => `<option value="quiz:${k}">Quiz · ${T(q.titre)}</option>`).join("")}</select></div>
          <div><label class="f">Titre court</label><input type="text" id="aN" maxlength="40" placeholder="Ex. Point d'étape"></div></div>
          <label class="f">Question (sondage, nuage)</label><input type="text" id="aQ" maxlength="160">
          <label class="f">Réponses du sondage, séparées par ;</label><input type="text" id="aO" placeholder="Oui ; Non ; Je ne sais pas">
          <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" type="submit">Ajouter</button><button class="btn sm ghost" type="button" id="aReset">Revenir à la séquence par défaut</button></div>
        </form>`;
      const saveActs = async (activities) => { session = await guard(() => api.updateSession(sid, { activities })) || session; draw(); };
      $$("[data-up]", box).forEach((b) => (b.onclick = () => { const L = [...session.activities], i = +b.dataset.up; [L[i - 1], L[i]] = [L[i], L[i - 1]]; saveActs(L); }));
      $$("[data-drop]", box).forEach((b) => (b.onclick = () => saveActs(session.activities.filter((_, i) => i !== +b.dataset.drop))));
      $("#aReset", box).onclick = () => confirm("Remplacer la séquence par celle proposée par défaut ?") && saveActs(defaultActivities(session.format));
      $("#addA", box).onsubmit = (e) => {
        e.preventDefault();
        const t = $("#aT", box).value, id = "a" + Date.now().toString(36);
        let a;
        if (t.startsWith("quiz:")) { const k = t.slice(5); a = { id, type: "quiz", quiz: k, titre: $("#aN", box).value.trim() || "Quiz · " + QUIZ[k].titre }; }
        else {
          const q = $("#aQ", box).value.trim(); if (!q) return toast("Indiquez la question.", "ko");
          a = { id, type: t, q, titre: $("#aN", box).value.trim() || (t === "poll" ? "Sondage" : "Nuage de mots") };
          if (t === "poll") { a.o = $("#aO", box).value.split(";").map((x) => x.trim()).filter(Boolean); if (a.o.length < 2) return toast("Au moins deux réponses.", "ko"); }
        }
        saveActs([...session.activities, a]);
      };
    };
    await draw();
    const redraw = debounce(() => { if (!box.contains(document.activeElement) || document.activeElement.tagName === "BUTTON") draw(); }, 300);
    cleanups.push(api.watch(sid, redraw));
  }

  /* =================================================================
     APRÈS
     ================================================================= */
  async function phaseApres() {
    const [roster, projects, resources, secrets] = await Promise.all([api.roster(sid), api.listProjects(sid), api.listResources(sid), api.listSecrets(sid)]);
    const by = Object.fromEntries(roster.map((r) => [r.user_id, r]));
    const validated = projects.filter((p) => p.status === "validated");
    box.innerHTML = `
      <div class="card"><p style="margin:0 0 10px">${roster.length} participant·es · ${hasCadrage(session) ? `${validated.length} cadrage(s) validé(s) · ` : ""}${roster.filter((r) => r.attended).length} présent·es émargé·es. ${T("Les projets, retours et résultats restent consultables après la session.")}</p>
        <div class="chips">${hasCadrage(session) ? `<a class="btn sm" href="#projets">Voir les projets</a>` : ""}<a class="btn sm ghost" href="#emarg">Émargement, bilan et duplication</a><a class="btn sm ghost" href="#resultats">Résultats à l'écran</a></div></div>

${hasCadrage(session) ? `      <div class="card" id="projets" style="margin-top:14px"><h3>Projets (${projects.length})</h3>
        ${projects.length ? `<div class="grid g2">${projects.map((p) => `<div class="proj-card"><span class="tag${p.status === "validated" ? " ok" : ""}">${p.status === "validated" ? "✓ Validé" : "En cours"}</span><b>${T(p.data?.retenu?.titre || "Sans titre")}</b><div class="small muted">${T(by[p.user_id]?.full_name || by[p.user_id]?.email || "")}</div><p class="small">${T((p.data?.retenu?.description || "").slice(0, 260))}</p>${p.trainer_comment ? `<p class="small"><b>Votre retour :</b> ${T(p.trainer_comment)}</p>` : ""}</div>`).join("")}</div>` : `<p class="empty">Aucun cadrage.</p>`}</div>` : ""}

      <div class="card" id="emarg" style="margin-top:14px"><h3>Émargement</h3>
        ${roster.length ? `<table class="tbl"><thead><tr><th>Présent·e</th><th>Nom</th><th>E-mail</th><th>Cadrage</th></tr></thead><tbody>${roster.map((r) => `<tr><td><input type="checkbox" data-att="${r.user_id}"${r.attended ? " checked" : ""} aria-label="Présence de ${esc(r.full_name || r.email)}"></td><td>${T(r.full_name || "—")}</td><td class="small">${esc(r.email)}</td><td class="small">${r.project_status === "validated" ? "Validé" : r.project_id ? `${r.project_steps}/${STEPS.length}` : "—"}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Aucun participant.</p>`}
        <div class="chips" style="margin-top:12px"><button class="btn sm" id="csv">Exporter le bilan (CSV)</button>${admin ? `<button class="btn sm ghost" id="dup">Dupliquer la session</button>` : ""}</div>
        <p class="small muted">${T("Le bilan reprend présence, profil, état du cadrage, progression dans le déroulé et scores aux quiz. La duplication reprend la séquence, les ressources et les intitulés des accès (sans les valeurs), sans participant·es.")}</p></div>

      <div class="card chat-card" id="discussion" style="margin-top:14px"><h3>Discussion des stagiaires</h3><p class="small muted" style="margin-top:0">${T("Après la clôture, les stagiaires n'y ont plus accès ; vous gardez l'historique.")}</p><div id="chatAdm"></div></div>

      <div class="card" id="resultats" style="margin-top:14px"><h3>Résultats des activités</h3><div id="resBox" class="grid g2"><p class="small muted">Chargement…</p></div></div>

      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Ressources de la session</h3><p class="small muted" style="margin-top:0">Visibles par les participant·es dans « Ressources du jour ».</p>
          ${resources.map((r) => `<div class="prow"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${T(r.title)} ↗</a><button class="iconbtn danger" data-rres="${r.id}" aria-label="Retirer">✕</button></div>`).join("")}
          <form id="resF" class="askrow" style="margin-top:10px"><input type="text" id="rT" placeholder="Titre" required><input type="url" id="rU" placeholder="https://" required><button class="btn sm" type="submit">Ajouter</button></form></div>
        <div class="card"><h3>Codes et accès des exercices</h3><p class="small muted" style="margin-top:0">${T("Comptes de démonstration, clés d'API de test… Les stagiaires les copient depuis « Ressources du jour ». N'y mettez jamais d'identifiant personnel.")}</p>
          ${secrets.map((s) => `<div class="secret-edit"><div class="small"><b>${T(s.label)}</b> <span class="muted">${s.value ? "renseigné" : "aucune valeur"}</span> <button class="linkbtn small" data-rsec="${s.id}">Retirer</button></div><form class="askrow" data-sec="${s.id}"><input type="text" placeholder="Coller la valeur" value="${esc(s.value)}"><button class="btn sm" type="submit">Enregistrer</button></form></div>`).join("")}
          <form id="secF" class="askrow" style="margin-top:10px"><input type="text" id="sL" placeholder="Intitulé (ex. Compte Gemini de démo)" required><button class="btn sm" type="submit">Ajouter</button></form></div>
      </div>`;
    const reload = () => go(location.hash);
    $$("[data-att]", box).forEach((c) => (c.onchange = () => guard(() => api.setAttended(sid, c.dataset.att, c.checked))));
    if ($("#dup", box)) $("#dup", box).onclick = () => openDuplicate(api, session, go);
    cleanups.push(mountChat($("#chatAdm", box), { api, sid, me: ctx.me, staff: true, compact: true }));
    $("#csv", box).onclick = () => {
      const quizzes = Object.keys(QUIZ);
      const head = ["Nom", "E-mail", "Présent", "Métier", "Niveau IA", "Cadrage", "Cas d'usage", "Retour formateur", "Déroulé (séquences cochées)", ...quizzes.map((q) => "Quiz " + QUIZ[q].titre)];
      const lines = roster.map((r) => {
        const p = projects.find((x) => x.user_id === r.user_id);
        return [r.full_name, r.email, r.attended ? "oui" : "non", r.metier, r.niveau, r.project_status === "validated" ? "validé" : r.project_id ? `${r.project_steps}/${STEPS.length}` : "non commencé",
          p?.data?.retenu?.titre, p?.trainer_comment, Object.values(r.progress?.done || {}).filter(Boolean).length, ...quizzes.map((q) => r.progress?.quiz?.[q] ?? "")];
      });
      const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      download(`bilan-${(session.client || session.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${session.date || "session"}.csv`, csv);
    };
    $("#resF", box).onsubmit = async (e) => { e.preventDefault(); if (await guard(() => api.addResource(sid, { title: $("#rT", box).value.trim(), url: $("#rU", box).value.trim() }), "Ressource ajoutée.")) reload(); };
    $$("[data-rres]", box).forEach((b) => (b.onclick = async () => { await guard(() => api.removeResource(b.dataset.rres)); reload(); }));
    $("#secF", box).onsubmit = async (e) => { e.preventDefault(); if (await guard(() => api.addSecret(sid, $("#sL", box).value.trim()))) reload(); };
    $$("form[data-sec]", box).forEach((f) => (f.onsubmit = async (e) => { e.preventDefault(); await guard(() => api.updateSecret(f.dataset.sec, $("input", f).value.trim()), "Enregistré."); }));
    $$("[data-rsec]", box).forEach((b) => (b.onclick = async () => { await guard(() => api.removeSecret(b.dataset.rsec)); reload(); }));
    $$('a[href^="#"]', box).forEach((a) => { if (!a.getAttribute("href").startsWith("#/")) a.onclick = (e) => { e.preventDefault(); $(a.getAttribute("href"), box)?.scrollIntoView({ behavior: "smooth" }); }; });

    // Résultats agrégés de chaque activité (quiz : par question, avec le taux de bonnes réponses)
    const blocks = [];
    for (const act of session.activities) {
      if (["welcome", "projects"].includes(act.type)) continue;
      if (act.type === "quiz") {
        const qs = QUIZ[act.quiz].q;
        const rows = await Promise.all(qs.map((_, qi) => api.results(sid, `${act.id}#${qi}`)));
        if (!rows.some((r) => r.length)) continue;
        blocks.push(`<div class="res-block"><b>${T(act.titre)}</b>${qs.map((q, qi) => { const n = countOf(rows[qi]), good = rows[qi].filter((r) => r.value === q[2]).reduce((a, r) => a + r.n, 0); return `<div class="small prow"><span>${qi + 1}. ${T(q[0])}</span><b>${n ? Math.round((good / n) * 100) + NB + "%" : "—"}</b></div>`; }).join("")}<div class="small muted">Taux de bonnes réponses par question</div></div>`);
      } else {
        const rows = await api.results(sid, act.id);
        if (!rows.length) continue;
        const live = {};
        blocks.push(`<div class="res-block"><b>${T(act.titre)}</b><div class="small muted">${T(act.q || "")} · ${countOf(rows)} réponse(s)</div>${renderResults(act, live, rows)}</div>`);
      }
    }
    $("#resBox", box).innerHTML = blocks.join("") || `<p class="empty">Aucune réponse enregistrée.</p>`;
  }
}
