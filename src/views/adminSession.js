/* Back-office d'une session, en trois temps :
   Avant (accès, invitations, cadrages), Jour J (animation en direct),
   Après (projets, émargement, bilan, duplication, résultats, ressources). */
import { mountChat, chatOn } from "../lib/chat.js";
import { keepDraft } from "../lib/draft.js";
import { $, $$, T, esc, fr, NB, guard, toast, debounce, dateFr, download, copyText, safeUrl, safeImg } from "../lib/dom.js";
import { ACT_TYPES, currentAct, respKey, renderResults, defaultActivities, countOf, P as presetAct } from "../lib/activities.js";
import { quizFor, quizKeysOf, snapshotQuizzes, pollActivity, respKeys, outdated, copyOf, newItemId } from "../lib/quizzes.js";
import { mountEditor, blankValue, valueOf } from "../lib/quizEditor.js";
import { screenHtml, nextPage, stepLive, pageKey, modPages, skipSet } from "../lib/screen.js";
import { openSheet, closeSheet } from "../lib/content.js";
import { joinUrl, joinUrlLabel, qr, showQr, parseEmails, openDuplicate } from "./admin.js";
import { logoPair } from "./settings.js";
import { STEPS, SENSIB, VERIF } from "./cadrageModel.js";
import { datesFr, hhmm, emargementQr, fileToDataUrl, resolveBranding, logosHtml, EM2_DEFAULT, evaluationQr, EVAL_TITLE, EVAL_TEXT } from "../lib/brand.js";
import { modulesFor, baseModules, defaultModules, levelOf, daysOf, typeLabel, hasCadrage, emargementSlots, actPlace, actsByModule } from "../lib/content.js";
import { DAY_TITLES } from "../data.js";
import { parseConducteur, conducteurMarkdown } from "../lib/conducteur.js";
import { applyPatch, trameFromSession } from "../lib/applyProgramme.js";
import { isLunch, pauseTargets, movePause, shiftPause, pauseAlert, pauseAlertText, endBounds, dayEnd } from "../lib/programme.js";
import { loadSkins, skinFor, applySkin, currentSkin } from "../lib/skin.js";
import { samsaHtml } from "../lib/brand.js";
import { isAdmin } from "../lib/roles.js";
import { ICON } from "../lib/adminNav.js";
import { popIn } from "../lib/motion.js";
import { dateOfDay, MAX_DAYS } from "../lib/archive.js";
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
const onlineSub = (on) => (on ? "écran et discussion ouverts aux stagiaires" : "désactivée");
// Première ouverture de la salle du jour : point de départ du chronomètre du pilotage
const stamp = (live) => (live?.started?.day === parisDay() ? live.started : { day: parisDay(), at: new Date().toISOString() });
const firstName = (r) => (r.full_name || r.email.split("@")[0]).split(" ")[0];

// Données de l'écran projeté (réponses agrégées, participants, projets)
// Écrans d'ouverture et de clôture (projetables salle fermée)
export const OPENING_VIEWS = new Set(["title", "trainer", "emargement", "support", "evaluation", "qr", "pause"]);

export async function loadScreenData(api, session, { trainee = false } = {}) {
  const act = currentAct(session);
  const [rows, roster, projects] = await Promise.all([
    act && session.status === "live" ? api.results(session.id, respKey(act, session.live, session)) : [],
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

/* Ajouter un·e stagiaire : pour une personne qui ne reçoit pas le code (filtre, faute de frappe dans une adresse
   qu'elle ne peut pas corriger, boîte inaccessible en salle). Rien n'est envoyé, deux façons de la faire entrer :
   - accès direct (action grant) : le compte est créé et inscrit tout de suite ; la personne tape son adresse sur
     la page d'entrée et entre sans code, une seule fois, dans les 24 heures ;
   - code à transmettre (action issue) : le code s'affiche ici, dans le panneau du pilotage (pas sur l'écran
     projeté), et se transmet de vive voix ou par message. Il remplace le code précédent de cette adresse ;
     la personne entre par « J'ai déjà un code » avec la même adresse. */
const ACCESS_MODES = [
  ["direct", "Accès direct", "La personne tape son adresse sur la page d'entrée et entre sans code. Une seule fois, dans les 24 heures.", "Donner l'accès direct"],
  ["code", "Code à transmettre", "Vous lui donnez un code de vive voix ou par message. Valable sur tous ses appareils jusqu'à la fin de la formation.", "Générer le code"],
];
function openAccessSheet(api, session) {
  const until = (exp) => new Date(exp).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
  let mode = "direct";
  const submitLabel = () => ACCESS_MODES.find(([k]) => k === mode)[3];
  const form = (first = "", email = "") => {
    openSheet(`<span class="pill">Accès stagiaire</span><h2>Ajouter un·e stagiaire</h2>
      <p class="small muted">${T("Pour une personne qui ne reçoit pas son code par e-mail. Aucun e-mail ne part.")}</p>
      <form id="icF">
        <label class="f" for="icFn">Prénom</label><input type="text" id="icFn" required maxlength="40" autocomplete="off" value="${esc(first)}">
        <label class="f" for="icEm">Adresse e-mail</label><input type="email" id="icEm" required maxlength="200" autocomplete="off" value="${esc(email)}" placeholder="celle qu'elle saisira à l'entrée">
        <fieldset class="acc-mode"><legend class="f">Comment la faire entrer</legend>
          ${ACCESS_MODES.map(([k, l, d]) => `<label><input type="radio" name="icMode" value="${k}"${k === mode ? " checked" : ""}><span><b>${l}</b><span class="small muted">${T(d)}</span></span></label>`).join("")}
        </fieldset>
        <button class="btn" type="submit">${submitLabel()}</button>
      </form>`);
    $("#icFn").focus();
    const btn = $("#icF button");
    $("#icF").onchange = (e) => { if (e.target.name === "icMode") { mode = e.target.value; btn.textContent = submitLabel(); } };
    $("#icF").onsubmit = async (e) => {
      e.preventDefault();
      const fn = $("#icFn").value.trim(), em = $("#icEm").value.trim().toLowerCase();
      btn.disabled = true; btn.textContent = mode === "direct" ? "Enregistrement…" : "Génération…";
      if (mode === "direct") {
        const r = await guard(() => api.grantAccess(session.id, fn, em));
        if (r?.granted) return showDirect(fn, em, r);
      } else {
        const r = await guard(() => api.issueAccess(session.id, fn, em));
        if (r?.code) return showCode(fn, em, r);
      }
      btn.disabled = false; btn.textContent = submitLabel();
    };
  };
  const again = () => { $("#icAgain").onclick = () => form(); };
  const showDirect = (fn, em, r) => {
    const link = joinUrl(session.code), date = until(r.expires_at);
    const msg = fr(`Bonjour ${fn}, pour entrer dans la formation « ${session.title} » : ouvrez ${link}, touchez « Commencer », indiquez votre prénom et l'adresse ${em}, puis touchez « Recevoir mon code ». Vous entrerez directement, sans code à saisir. Cet accès sert une seule fois, jusqu'au ${date}.`);
    openSheet(`<span class="pill">Accès stagiaire</span><h2>${T(fn)} peut entrer</h2>
      <p class="small muted" style="margin:0">${esc(em)}</p>
      <div class="granted">${T(r.enrolled === false ? "Accès direct enregistré. Son compte sera créé à sa première entrée." : "Inscrit·e à la session, accès direct enregistré.")}<br><span class="small">${T(`Une seule entrée, jusqu'au ${date}.`)}</span></div>
      <div class="issued-acts"><button class="btn sm ghost" id="icMsg">Copier un message prêt à envoyer</button></div>
      <h4 style="margin:16px 0 6px">À lui dire</h4>
      <ol class="small" style="padding-left:18px;line-height:1.6;margin:0">
        <li>${T(`Ouvrir la page d'entrée : QR code de la salle ou ${joinUrlLabel(session.code)}.`)}</li>
        <li>${T(`Toucher « Commencer », puis indiquer son prénom et l'adresse ${em}.`)}</li>
        <li>${T("Toucher « Recevoir mon code » : l'espace s'ouvre aussitôt, sans code à saisir.")}</li>
      </ol>
      <p class="small muted">${T("Si la personne attend déjà son code à l'écran : « Recevoir un nouveau code », puis « Recevoir mon code ». Pour un deuxième appareil, générez-lui plutôt un code.")}</p>
      <button class="linkbtn small" id="icAgain" style="margin-top:10px">Ajouter une autre personne</button>`);
    $("#icMsg").onclick = (e) => copyText(msg, e.currentTarget);
    again();
  };
  const showCode = (fn, em, r) => {
    const link = joinUrl(session.code), date = until(r.expires_at);
    const msg = fr(`Bonjour ${fn}, voici votre code d'accès à la formation « ${session.title} » : ${r.code}\nSur ${link}, touchez « J'ai déjà un code », puis saisissez votre adresse ${em} et ce code. Il est valable jusqu'au ${date}.`);
    openSheet(`<span class="pill">Accès stagiaire</span><h2>Code de ${T(fn)}</h2>
      <p class="small muted" style="margin:0">${esc(em)}</p>
      <div class="issued-code mono" id="icCode" aria-label="Code d'accès">${esc(r.code)}</div>
      <div class="issued-acts"><button class="btn sm" id="icCopy">Copier le code</button><button class="btn sm ghost" id="icMsg">Copier un message prêt à envoyer</button></div>
      <p class="small">${T(`Valable jusqu'au ${date}, sur tous ses appareils.`)}</p>
      <h4 style="margin:16px 0 6px">À lui dire</h4>
      <ol class="small" style="padding-left:18px;line-height:1.6;margin:0">
        <li>${T(`Ouvrir la page d'entrée : QR code de la salle ou ${joinUrlLabel(session.code)}.`)}</li>
        <li>${T("Toucher « J'ai déjà un code ».")}</li>
        <li>${T(`Saisir l'adresse ${em} et le code.`)}</li>
      </ol>
      <p class="small muted">${T("Si la personne attend déjà son code à l'écran, elle le saisit directement.")}</p>
      <button class="linkbtn small" id="icAgain" style="margin-top:10px">Ajouter une autre personne</button>`);
    $("#icCopy").onclick = (e) => copyText(r.code, e.currentTarget);
    $("#icMsg").onclick = (e) => copyText(msg, e.currentTarget);
    again();
  };
  form();
}

export async function viewAdminSession(root, [sid, phase = "avant"], ctx) {
  const admin = isAdmin(ctx.me); // l'attribution, l'habillage et la duplication restent à l'administration
  const { api, go } = ctx;
  await api.closeFinished().catch(() => 0); // finie depuis plus de 15 min : la session passe à « Terminée »
  let session = await api.getSession(sid);
  if (!session) { root.innerHTML = `<div class="card"><h2>Session introuvable</h2><a class="btn" href="#/admin">Retour</a></div>`; return; }
  if (!PHASES.some(([k]) => k === phase)) phase = "avant";
  const qrUrl = await qr(joinUrl(session.code), 480);

  // Bouton de la salle : « Ouvrir la salle », pastille rouge « En direct » (ferme en deux clics) ou « Rouvrir »
  const roomBtnHtml = () => session.status === "draft" ? `<button class="btn sm" data-status="live">Ouvrir la salle</button>`
    : session.status === "live" ? `<button type="button" class="state live room-btn room-head" data-status="draft" title="${esc(fr("Salle ouverte : cliquer pour fermer la salle"))}" aria-label="Salle ouverte : fermer la salle"><span class="rb-l"><span class="rb-txt">En direct</span><span class="rb-hint">Fermer la salle</span><span class="rb-arm">${T("Confirmer ?")}</span></span></button>`
    : `<button class="btn sm ghost" data-status="live">Rouvrir</button>`;
  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead sess-head"><div>
      <h1 style="margin:0">${T(session.title)}</h1>
      <p class="muted" style="margin:4px 0">${T(session.formation)} · ${T(datesFr(session))} · code <b class="mono">${esc(session.code)}</b></p>
    </div>
    <div class="head-actions">${session.status !== "closed" ? `<button class="btn ghost sm" id="addBtn" title="Faire entrer une personne qui ne reçoit pas l'e-mail : accès direct ou code à transmettre">Ajouter un·e stagiaire</button>` : ""}<a class="btn ghost sm" href="#/s/${sid}" title="Voir l'espace tel que le voient les stagiaires">Voir côté stagiaire</a>
      <span class="room-box" id="roomBox">${roomBtnHtml()}</span></div></div>
    <div class="phases">${PHASES.map(([k, l]) => `<a href="#/admin/s/${sid}/${k}"${k === phase ? ' aria-current="page"' : ""}>${phaseLabel(k, l, session)}</a>`).join("")}</div>
    ${phase === "jour" ? `<div class="head-live"><div class="clock" id="clock" aria-live="off"></div>
        <div class="joinbox"><img src="${qrUrl}" alt="QR code de la session"><span class="jb-txt"><span class="small">Rejoindre la session</span><b class="mono">${esc(session.code)}</b></span><button class="btn sm ghost" id="pjQ" title="Afficher le QR code sur l'écran projeté (salle ouverte ou non)">Projeter le QR code</button></div>
        <label class="onlinebox${session.online ? " on" : ""}" id="onlineLbl" title="${esc(fr("Formation à distance : les stagiaires voient dans leur espace ce que montre l'écran projeté (pages du support, présentations, séquences, émargement) et peuvent écrire dans la discussion. En salle, la discussion leur reste fermée."))}"><input type="checkbox" role="switch" id="onlineMode"${session.online ? " checked" : ""}><span class="ob-txt"><b>Formation en ligne</b><span class="small" id="onlineSub">${onlineSub(session.online)}</span></span></label></div>` : ""}
    <div id="phase"></div>`;
  /* Ouvrir ou fermer la salle sans redessiner la page : seul le bouton change (syncRoom, aussi appelé par tick quand
     le statut change ailleurs : lancement d'une séquence, écran projeté, autre onglet), puis l'horloge et le pilotage
     suivent. Rouvrir une session close redessine tout (l'écran change de nature). */
  const roomBox = $("#roomBox", root);
  roomBox._html = roomBtnHtml();
  const syncRoom = () => { const h = roomBtnHtml(); if (roomBox._html !== h) { roomBox.innerHTML = h; roomBox._html = h; } };
  roomBox.onclick = async (e) => {
    const b = e.target.closest("[data-status]");
    if (!b || b.disabled) return;
    // « En direct » : fermer la salle en deux clics (« Confirmer ? » pendant 4 s), comme dans la liste des sessions
    if (b.classList.contains("room-btn") && !b.classList.contains("armed")) {
      b.classList.add("armed"); clearTimeout(b._disarm);
      b._disarm = setTimeout(() => b.classList.remove("armed"), 4000);
      return;
    }
    clearTimeout(b._disarm); b.disabled = true;
    const st = b.dataset.status, was = session.status;
    const s2 = await guard(() => api.updateSession(sid, { status: st, live: st === "live" ? { ...(session.live || {}), ...(!session.live?.view && !session.live?.act ? { view: "title", started_at: new Date().toISOString() } : {}), started: stamp(session.live) } : (session.live?.started ? { started: session.live.started } : {}) }), st === "live" ? "Salle ouverte : les stagiaires peuvent répondre." : "Salle fermée.");
    if (!s2) { b.disabled = false; b.classList.remove("armed"); return; }
    session = s2;
    if (was === "closed") return go(location.hash);
    syncRoom(); tick(); afterLive();
    popIn(roomBox.firstElementChild);
  };
  $("#addBtn", root)?.addEventListener("click", () => openAccessSheet(api, session));

  const box = $("#phase", root);
  const cleanups = [];

  /* Bandeau du Jour J (sous les onglets) : état de la salle, heure de Paris et minuteur de la journée.
     Le minuteur part de la première ouverture de la salle ce jour-là (live.started = {day, at}, posé par
     « Ouvrir la salle » ou le lancement d'une séquence), ou de la remise à zéro faite ce jour-là avec le bouton ↺
     (live.clock = {day, at}). Tant que la salle n'a pas été ouverte dans la journée : « début prévu à » l'heure
     de début de la session (Réglages).
     Même dessin que le minuteur de pratique des stagiaires : pavé sombre, libellé à gauche, heure en chasse fixe. */
  const hm2 = (h, m) => `${String(h).padStart(2, "0")} h ${String(m).padStart(2, "0")}`;
  const hmMin = (x) => hm2(Math.floor(x / 60), x % 60);
  const parisMin = (d) => { const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).split(":").map(Number); return h * 60 + m; };
  const clockRef = () => { // minute du jour (heure de Paris) d'où part le minuteur, ou null si la journée n'a pas commencé
    const today = parisDay(), c = session.live?.clock, s = session.live?.started;
    if (c?.day === today) return parisMin(new Date(c.at));
    if (s?.day === today) return parisMin(new Date(s.at));
    return null;
  };
  const plannedTxt = () => { const [h, m] = String(session.start_time || "09:30").split(":").map(Number); return hm2(h || 0, m || 0); };
  /* Minuteur agrandi (icône ⤢ du pavé) : il passe en tête de la colonne Pilotage, sur toute sa largeur, chiffres en
     grand, et reste collé au bord supérieur de la fenêtre quand on fait défiler la page (sticky). Choix gardé dans ce
     navigateur. Réduit, il revient dans le bandeau du Jour J. */
  const CLOCK_BIG = "iagen-clock-big";
  let clockBig = false; try { clockBig = localStorage.getItem(CLOCK_BIG) === "1"; } catch {}
  const unplaceClock = () => { const el = $("#clock", root), bar = $(".head-live", root); if (el && bar && el.parentNode !== bar) bar.prepend(el); };
  const placeClock = () => {
    const el = $("#clock", root), bar = $(".head-live", root), slot = $("#clockSlot", root);
    if (!el || !bar) return;
    const big = clockBig && !!slot;
    if (big && el.parentNode !== slot) slot.appendChild(el);
    if (!big) unplaceClock();
    el.classList.toggle("big", big);
    // Collé en haut : coins du haut carrés et ombre légère (IntersectionObserver, une seule fois par emplacement)
    if (big && !slot._io && typeof IntersectionObserver === "function") {
      slot._io = new IntersectionObserver(([en]) => slot.classList.toggle("stuck", en.intersectionRatio < 1), { threshold: [1], rootMargin: "-1px 0px 0px 0px" });
      slot._io.observe(slot);
      cleanups.push(() => slot._io?.disconnect());
    }
  };
  const tick = () => {
    syncRoom();
    const el = $("#clock", root); if (!el) return;
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
    const nowMin = parisMin(new Date()), ref = clockRef(), on = session.status === "live";
    // Pastille d'état toujours au même gabarit (rond + libellé) et seconde ligne toujours présente : le pavé ne change pas de hauteur
    const state = on ? `<span class="state live">En direct</span>` : `<span class="state off">${session.status === "closed" ? "Session terminée" : "Salle fermée"}</span>`;
    const sub = session.status === "closed" ? "" : ref === null ? `début prévu à ${plannedTxt()}`
      : on ? `écoulé ${dur(Math.max(0, nowMin - ref))} · depuis ${hmMin(ref)}` : `journée commencée à ${hmMin(ref)}`;
    const html = `<span class="clk-lbl">${state}<span class="clk-sub">${sub ? fr(sub) : "&nbsp;"}</span></span><b class="t">${hm2(Math.floor(nowMin / 60), nowMin % 60)}</b>`
      + `<span class="clk-btns"><button type="button" class="clk-size" data-clk-size aria-pressed="${clockBig}" title="${clockBig ? "Réduire le minuteur" : "Agrandir le minuteur : toute la largeur de la colonne Pilotage, toujours visible en haut de la fenêtre"}" aria-label="${clockBig ? "Réduire le minuteur" : "Agrandir le minuteur"}">${clockBig ? ICON.shrink : ICON.expand}</button>`
      + `<button type="button" class="clk-reset" data-clk-reset title="Remettre le minuteur à zéro : le temps écoulé repart de maintenant" aria-label="Remettre le minuteur à zéro">↺</button></span>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; } // comparaison au dernier rendu (le SVG ne se relit pas à l'identique)
    qrBtn(); // l'écran a pu changer depuis le pilotage ou l'écran projeté
  };
  // ↺ du minuteur (délégation : le contenu du pavé est réécrit à chaque minute)
  if ($("#clock", root)) $("#clock", root).onclick = async (e) => { // pavé présent dans l'onglet Jour J seulement
    if (e.target.closest("[data-clk-size]")) { // agrandir ou réduire
      clockBig = !clockBig; try { localStorage.setItem(CLOCK_BIG, clockBig ? "1" : "0"); } catch {}
      placeClock(); tick(); popIn($("#clock", root)); $("#clock [data-clk-size]", root)?.focus();
      return;
    }
    if (!e.target.closest("[data-clk-reset]")) return;
    const live = { ...(session.live || {}), clock: { day: parisDay(), at: new Date().toISOString() } };
    session = await guard(() => api.updateSession(sid, { live }), "Minuteur remis à zéro : le temps écoulé repart de maintenant.") || session;
    tick(); afterLive();
  };
  // Interrupteur « Formation en ligne » du bandeau du Jour J : l'écran projeté s'affiche dans l'espace des stagiaires
  if ($("#onlineMode", root)) $("#onlineMode", root).onchange = async (e) => {
    const on = e.target.checked;
    const s2 = await guard(() => api.updateSession(sid, { online: on }), on ? "Mode en ligne : les stagiaires voient l'écran dans leur espace, la discussion leur est ouverte." : "Mode en ligne désactivé : écran et discussion fermés aux stagiaires.");
    if (s2) session = s2; else e.target.checked = !on;
    $("#onlineLbl", root).classList.toggle("on", !!session.online);
    $("#onlineSub", root).textContent = onlineSub(session.online);
    afterOnline();
  };
  /* Écrans en bascule, salle ouverte ou non : « Projeter le QR code » du bandeau du Jour J (pour un·e retardataire),
     et les écrans d'ouverture, de pause et de clôture du pilotage (OPENING_VIEWS). Projeter un de ces écrans garde
     de côté ce qui était projeté (live.prev, en pile : titre, puis émargement, puis formateur…) ; un second clic sur
     l'écran projeté remet l'écran précédent (une page du support, une séquence, une activité, l'écran d'accueil).
     Lancer autre chose entre-temps (séquence, page, activité, présentation) abandonne la pile. */
  const KEEP = ["module", "emarg", "tools", "started", "clock"]; // ce qui survit à tout changement d'écran
  const pick = (o, keep) => Object.fromEntries(Object.entries(o).filter(([k]) => keep(k)));
  const trimPrev = (p, n = 6) => { if (!p || n <= 0) return undefined; const { prev, ...rest } = p; const q = trimPrev(prev, n - 1); return q ? { ...rest, prev: q } : rest; };
  // l'écran en cours, sans ce qui survit de toute façon ; sa pile seulement s'il est lui-même en bascule (une page
  // atteinte à la flèche depuis un écran d'ouverture en garde une trace sans objet)
  const stash = (l) => trimPrev(pick(l || {}, (k) => !KEEP.includes(k) && (k !== "prev" || OPENING_VIEWS.has(l.view))));
  const unstash = (l) => ({ ...pick(l, (k) => KEEP.includes(k)), ...(l.prev || {}) }); // l'écran précédent revient
  let afterLive = () => {}; // le pilotage du Jour J redessine l'aperçu
  let afterOnline = () => {}; // le Jour J ouvre ou ferme le widget de la discussion
  function qrBtn() {
    const b = $("#pjQ", root); if (!b) return;
    const on = session.live?.view === "qr", label = on ? "QR code projeté" : "Projeter le QR code";
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Revenir à l'écran projeté avant le QR code" : "Afficher le QR code sur l'écran projeté (salle ouverte ou non)";
  }
  if ($("#pjQ", root)) $("#pjQ", root).onclick = async () => {
    const l = session.live || {}, base = pick(l, (k) => KEEP.includes(k));
    const back = l.view === "qr";
    const live = back ? unstash(l) : { ...base, view: "qr", prev: stash(l), started_at: new Date().toISOString() };
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
          <p class="small muted" style="margin-top:4px">${T("Couleur d'accent et logo du centre, appliqués à l'espace stagiaire, aux slides d'entrée et à l'écran. ")}${admin ? `<a href="#/admin/reglages/habillages">Gérer les habillages</a>` : "Choisi par l'administration."}</p>
          <label class="f">Format</label>
          <div class="chips" id="gFmt">${[["1", "Une journée"], ["2", "Deux journées"]].map(([v, l]) => `<label class="radio"><input type="radio" name="fmt" value="${v}"${session.format === v ? " checked" : ""}${session.programme?.modules?.length ? " disabled" : ""}> ${l}</label>`).join("")}</div>
          <p class="small muted">${T("Le format détermine le déroulé visible côté stagiaire : en une journée, seul le programme d'une journée est accessible.")}</p>
          <div class="grid g2">
            <div><label class="f" for="gD1">Date (jour 1)</label><input type="date" id="gD1" value="${esc(session.date || "")}"></div>
            ${Array.from({ length: MAX_DAYS - 1 }, (_, i) => i + 2).map((d) => `<div class="dwrap" data-dday="${d}"><label class="f" for="gD${d}">Date (jour ${d})</label><input type="date" id="gD${d}" value="${esc(dateOfDay(session, d) || "")}"></div>`).join("")}
            <div><label class="f" for="gS">Début</label><input type="time" id="gS" value="${esc(String(session.start_time || "09:30").slice(0, 5))}"></div>
            <div><label class="f" for="gE">Fin</label><input type="time" id="gE" value="${esc(String(session.end_time || "17:30").slice(0, 5))}"></div>
          </div>
          <label class="f">Accès des stagiaires</label>
          <div class="chips" id="gAcc">${[["ouvert", "Ouvert"], ["invites", "Sur invitation"]].map(([v, l]) => `<label class="radio"><input type="radio" name="acc" value="${v}"${(session.access_mode || "ouvert") === v ? " checked" : ""}> ${l}</label>`).join("")}</div>
          <p class="small muted">${T("Ouvert : toute personne qui a le code ou le QR de la session peut demander son code d'accès. Sur invitation : seules les adresses ajoutées dans l'onglet Avant (et les personnes déjà inscrites).")}</p>
        </div>
        <div class="card" style="margin-top:14px" id="condCard"><h3>Conducteur</h3>
          <p class="small" id="condSrc"></p>
          <div class="cond-actions">
            <label class="btn sm">Importer un conducteur (.md)<input type="file" id="condFile" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden></label>
            <button type="button" class="btn sm ghost" id="condExport">Télécharger le conducteur actuel (.md)</button>
            <button type="button" class="linkbtn" id="condReset"${session.programme?.modules?.length ? "" : " hidden"}>Revenir au déroulé par défaut</button>
          </div>
          <div class="cond-actions" id="condTrames" hidden>
            <select id="condTrame" aria-label="Appliquer un programme"><option value="">Appliquer un programme…</option></select>
            ${admin ? `<button type="button" class="btn sm ghost" id="condSaveTrame">Enregistrer comme programme</button>` : ""}
          </div>
          <div id="condPrev"></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>Intervenant·e</h3>
          <select id="gTr"${admin ? "" : " disabled"}><option value="">— Choisir une fiche —</option>${trainers.map((t) => `<option value="${t.id}"${session.trainer_id === t.id ? " selected" : ""}>${T(t.name)}</option>`).join("")}</select>
          <p class="small muted">${T("Présenté·e sur la slide « Formateur ». La fiche choisie donne aussi accès à la session au compte qui porte son adresse de connexion. ")}${admin ? `<a href="#/admin/equipe/fiches">Gérer les fiches intervenant·es</a>` : T("Attribution faite par l'administration.")}</p>
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
          <p class="small muted">${T("Les entreprises récurrentes et leurs logos se gèrent dans ")}<a href="#/admin/reglages/entreprises">Réglages généraux</a>.</p>
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
      $("#evPrev", box).innerHTML = q ? `<img src="${safeImg(q)}" alt="QR de l'évaluation" class="thumb lg"><div class="chips" style="margin-top:6px"><a class="btn sm ghost" href="${safeImg(q)}" download="evaluation-${esc(session.code)}.png">Télécharger le QR (PNG)</a>${evQr ? `<button type="button" class="linkbtn small" id="evDel">Retirer l'image</button>` : ""}</div>` : "";
      $("#evDel", box)?.addEventListener("click", () => { evQr = null; drawEv(); });
    };
    $("#gEvU", box).oninput = debounce(drawEv, 400); drawEv();
    $("#gEvQ", box).onchange = async (e) => { const f = e.target.files[0]; if (f) { evQr = await guard(() => fileToDataUrl(f, 800)) || evQr; drawEv(); } };
    const fmt = () => box.querySelector('input[name="fmt"]:checked')?.value || session.format || "1";
    // Une date par journée : autant de champs que de journées (déroulé importé ou trame, sinon le format choisi)
    const nDays = () => (session.programme?.modules?.length ? daysOf(session).n : Number(fmt()) || 1);
    const syncD2 = () => $$(".dwrap", box).forEach((w) => (w.hidden = Number(w.dataset.dday) > nDays()));
    box.querySelectorAll('input[name="fmt"]').forEach((r) => (r.onchange = syncD2)); syncD2();
    const drawEm = async () => {
      const qrUrl2 = await emargementQr({ emargement_qr: emQr, emargement_url: $("#gEm", box).value.trim() }, 600);
      $("#emPrev", box).innerHTML = qrUrl2 ? `<img src="${safeImg(qrUrl2)}" alt="QR d'émargement" class="thumb lg"><div class="chips" style="margin-top:6px"><a class="btn sm ghost" href="${safeImg(qrUrl2)}" download="emargement-${esc(session.code)}.png">Télécharger le QR (PNG)</a>${emQr ? `<button type="button" class="linkbtn small" id="emDel">Retirer l'image</button>` : ""}</div>` : `<p class="small muted">Aucun émargement configuré.</p>`;
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
    const supInfo = (st) => {
      const at = st.unlock_at ? new Date(st.unlock_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }) : null;
      if (session.evaluation_url) return T(`Chaque stagiaire le débloque en touchant « Remplir l'évaluation ». L'évaluation lui est proposée dès que vous la projetez${at ? `, ou à partir du ${at} (une heure avant la fin)` : ""}. « Débloquer dès maintenant » la propose tout de suite. La page Support reste visible dans le menu des stagiaires.`);
      return at ? T(`Téléchargeable par les stagiaires dès que vous projetez l'évaluation, ou à partir du ${at} (une heure avant la fin). La page Support reste visible dans leur menu.`) : T("Renseignez la date et l'heure de fin pour programmer le déblocage, ou projetez l'évaluation le moment venu.");
    };
    $("#supInfo", box).innerHTML = supInfo(sup);
    bindConducteur();
    keepDraft($("#regF", box), `reglages:${sid}`, { saveLabel: "Enregistrer les réglages" }); // brouillon automatique + « Tout réinitialiser »
    $("#regF", box).onsubmit = async (e) => {
      e.preventDefault();
      const n = nDays(), format = String(n);
      const dates = Array.from({ length: n }, (_, i) => $(`#gD${i + 1}`, box).value || null);
      const missing = dates.findIndex((d, i) => i > 0 && !d && dates[0]);
      if (missing > 0) return toast(`Indiquez la date du jour ${missing + 1}.`, "ko");
      if (n > 2 && !("dates" in session)) return toast("Plus de deux journées : exécutez d'abord la migration 20261129000000_journees.sql dans Supabase.", "ko");
      const patch = {
        title: $("#gT", box).value.trim(), formation: $("#gF", box).value.trim() || "Prendre en main les IA génératives",
        format, date: dates[0], date2: n > 1 ? dates[1] : null, ...("dates" in session ? { dates: dates[0] ? dates : null } : {}),
        start_time: $("#gS", box).value || "09:30", end_time: $("#gE", box).value || "17:30",
        brand_id: box.querySelector('input[name="brand"]:checked')?.value || null, ...(admin ? { trainer_id: $("#gTr", box).value || null, skin_id: $("#gSk", box).value || null } : {}),
        emargement_url: $("#gEm", box).value.trim() || null, emargement_qr: emQr, emargement_label: $("#gEl", box).value.trim() || null,
        emargement2_enabled: $("#gE2", box).checked, emargement2_text: $("#gEt", box).value.trim() || null,
        access_mode: box.querySelector('input[name="acc"]:checked')?.value || "ouvert",
        slides_url: $("#gSl", box).value.trim() || null, skip_pages: formatPages(parsePages($("#gSkip", box).value)), support_unlocked: $("#gSuF", box).checked, decks,
        evaluation_url: $("#gEvU", box).value.trim() || null, evaluation_qr: evQr,
        evaluation_title: $("#gEvT", box).value.trim() || null, evaluation_text: $("#gEvX", box).value.trim() || null,
      };
      if (patch.slides_url && !deckId(patch.slides_url)) return toast("Lien Google Slides non reconnu.", "ko");
      if (patch.evaluation_url && !/^https?:\/\//i.test(patch.evaluation_url)) return toast("Le lien de l'évaluation doit commencer par https://", "ko");
      // Entreprise préenregistrée : ses nom et logos viennent des réglages généraux
      Object.assign(patch, patch.brand_id ? { client: "", client_logo: null, client_logo_light: null } : { client: $("#gC", box).value.trim(), client_logo: clientLogo, client_logo_light: clientLogoLight });
      const fmtChanged = format !== session.format;
      if (fmtChanged) {
        const bank = await api.listBank().catch(() => ({ ready: false, items: [] }));
        patch.activities = defaultActivities(format, bank.items);
        if (bank.ready) patch.quizzes = snapshotQuizzes(session.quizzes, quizKeysOf(patch.activities, modulesFor({ ...session, format })), bank.items);
      }
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
    // heures de fin modifiées dans le Jour J : elles restent en place si l'on importe un conducteur ou revient au déroulé par défaut
    const ends = session.programme?.ends || {}, endDays = Object.keys(ends).filter((d) => +d <= D.n).sort();
    const endsNote = endDays.length ? `Fin de journée modifiée dans le Jour J : ${endDays.map((d) => `${D.n > 1 ? `jour ${d} ` : ""}à ${ends[d].replace(/^0/, "").replace(":", " h ")}`).join(", ")}.` : "";
    $("#condSrc", box).innerHTML = T(imported && session.programme.base === "defaut"
      ? `Déroulé par défaut, pauses déplacées depuis le Jour J. « Revenir au déroulé par défaut » les remet à leur place.`
      : imported
      ? `Conducteur importé${session.programme.name ? ` (${session.programme.name})` : ""} : ${mods.filter((m) => m.type !== "pause").length} séquences sur ${D.n} journée${D.n > 1 ? "s" : ""}. Le format suit le conducteur.`
      : `Déroulé par défaut de la formation en ${session.format === "2" ? "deux journées" : "une journée"}. Importez un fichier .md pour le remplacer.`)
      + (session.format === "2" && (!imported || session.programme.base === "defaut") ? ` ${T(`Jour 2 en niveau ${levelOf(session) === "debutant" ? "débutant (R·M·C·T·F et ateliers en groupe)" : "expert (déroulé d'origine)"}, à changer dans le Jour J.`)}` : "")
      + (endsNote ? ` ${T(endsNote)}` : "");
    $("#condExport", box).onclick = () => download(`conducteur-${(session.code || "session").toLowerCase()}.md`,
      conducteurMarkdown(mods, { formation: session.programme?.formation || session.formation, days: D.titles }), "text/markdown;charset=utf-8");
    $("#condReset", box).onclick = async () => {
      if (!confirm("Revenir au déroulé par défaut ? Le conducteur importé sera retiré de cette session.")) return;
      const keepP = { ...(session.programme?.ends ? { ends: session.programme.ends } : {}), ...(session.programme?.level ? { level: session.programme.level } : {}) };
      if (await guard(() => api.updateSession(sid, { programme: Object.keys(keepP).length ? keepP : null }), "Déroulé par défaut rétabli.")) go(location.hash);
    };
    $("#condFile", box).onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      if (f.size > 300000) return toast("Fichier trop lourd pour un conducteur (300 Ko au plus).", "ko");
      const bank = await api.listBank().catch(() => ({ ready: false, items: [] }));
      const known = {
        quizzes: [...new Set([...bank.items.filter((b) => b.kind === "quiz").map((b) => b.id), ...Object.keys(session.quizzes || {})])],
        live: [...new Set([...bank.items.filter((b) => b.kind !== "quiz").map((b) => b.id), ...session.activities.filter((a) => a.type === "poll" || a.type === "cloud").map((a) => a.from || a.id)])],
      };
      const { programme, warnings, errors } = parseConducteur(await f.text(), known);
  programme.name = f.name;
  showPreview(programme, { title: f.name, errors, warnings, bank });
};
/* Aperçu d'un déroulé (fichier .md ou trame), puis application à la session (applyPatch : déroulé, format,
   quiz et sondages joués en salle ajoutés et placés, copie des quiz, lien du support sur demande) */
function showPreview(programme, { title, errors = [], warnings = [], bank }) {
  const rows = programme.modules.map((m) => `<tr><td class="mono small">${programme.nDays > 1 ? `J${m.day} · ` : ""}${m.t[0]}–${m.t[1]}</td><td><span class="pill ${m.type}">${typeLabel(m.type)}</span></td><td>${T(m.titre)}${m.cas ? `<div class="small muted">${T(m.cas)}</div>` : ""}</td><td class="small muted">${[m.obj && "objectifs", m.pts && "points clés", m.disc && "discussion", m.exo && `exercice ${m.exo.duree} min`, m.quiz && "quiz", (m.acts?.length || m.live) && `${(m.acts || [m.live]).length} activité(s) en salle`, m.pages && `p. ${m.pages}`].filter(Boolean).join(" · ")}</td></tr>`).join("");
  const slidesOpt = programme.slides_url && programme.slides_url !== session.slides_url;
  $("#condPrev", box).innerHTML = `<div class="cond-prev">
    <h4>Aperçu de « ${esc(title)} »</h4>
    ${errors.length ? `<div class="warn small"><b>${errors.length} erreur${errors.length > 1 ? "s" : ""} à corriger avant d'appliquer :</b><ul>${errors.map((x) => `<li>${T(x)}</li>`).join("")}</ul></div>` : ""}
    ${warnings.length ? `<details class="small cond-warn"><summary>${warnings.length} remarque${warnings.length > 1 ? "s" : ""} (sans blocage)</summary><ul>${warnings.map((x) => `<li>${T(x)}</li>`).join("")}</ul></details>` : ""}
    ${programme.modules.length ? `<div class="cond-table"><table class="tbl small"><thead><tr><th>Horaires</th><th>Type</th><th>Séquence</th><th>Contenu</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    ${slidesOpt ? `<label class="f inline small"><input type="checkbox" id="condSlides"${session.slides_url ? "" : " checked"}> ${T("Utiliser aussi le support du programme (lien Google Slides) pour cette session")}</label>` : ""}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button type="button" class="btn sm" id="condApply"${errors.length ? " disabled" : ""}>Appliquer (${programme.nDays} journée${programme.nDays > 1 ? "s" : ""})</button>
      <button type="button" class="btn sm ghost" id="condCancel">Annuler</button>
    </div></div>`;
  $("#condCancel", box).onclick = () => { $("#condPrev", box).innerHTML = ""; if ($("#condTrame", box)) $("#condTrame", box).value = ""; };
  $("#condApply", box).onclick = async () => {
    const format = String(programme.nDays);
    if (programme.nDays > 2 && !("dates" in session)) return toast("Plus de deux journées : exécutez d'abord la migration 20261129000000_journees.sql dans Supabase.", "ko");
    if (programme.nDays > 1 && Array.from({ length: programme.nDays }, (_, i) => dateOfDay({ ...session, format }, i + 1)).some((d) => !d)) toast("Pensez à indiquer la date de chaque journée dans les réglages.", "info");
    const patch = applyPatch(session, programme, bank, { slides: !!$("#condSlides", box)?.checked });
    if (await guard(() => api.updateSession(sid, patch), "Déroulé appliqué : parcours stagiaire, pilotage et activités sont à jour.")) go(location.hash);
  };
}
// Trames de conducteur (éditeur #/admin/trames) : appliquer une trame, ou enregistrer le déroulé de la session comme trame
api.listTrames().then((tl) => {
  if (!tl.ready || !$("#condTrames", box)) return;
  $("#condTrames", box).hidden = false;
  const sel = $("#condTrame", box);
  sel.insertAdjacentHTML("beforeend", tl.items.map((t) => `<option value="${t.id}">${T(t.titre)} · ${t.content?.nDays || 1} j.</option>`).join("") || `<option value="" disabled>Aucun programme : créez-en dans Studio, « Création de programmes »</option>`);
  sel.onchange = async () => {
    const t = tl.items.find((x) => x.id === sel.value); if (!t) return ($("#condPrev", box).innerHTML = "");
    const bank = await api.listBank().catch(() => ({ ready: false, items: [] }));
    showPreview({ ...t.content, name: t.titre, trame: t.id }, { title: t.titre, bank });
  };
}).catch(() => {});
$("#condSaveTrame", box)?.addEventListener("click", async () => {
  const titre = prompt("Titre du nouveau programme :", `${session.title}`.slice(0, 120));
  if (!titre?.trim()) return;
  const row = await guard(() => api.saveTrame({ titre: titre.trim(), content: trameFromSession(session) }), "Programme enregistré : retrouvez-le dans Studio, « Création de programmes ».");
  if (row) go(`#/admin/trames/${row.id}`);
});
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
              <td><b>${T(r.full_name || "—")}</b><div class="small muted">${esc(r.email || "")}</div></td>
              <td class="small">${T(r.metier || "—")}<div class="muted">${T(r.niveau || "")}</div></td>
              ${hasCadrage(session) ? `<td>${r.project_status === "validated" ? `<span class="tag ok">✓ Validé</span>` : r.project_id ? `<span class="tag">${r.project_steps}/${STEPS.length} · commencé</span>` : `<span class="small muted">Pas commencé</span>`}${r.project_title ? `<div class="small">${T(r.project_title)}</div>` : ""}</td>` : ""}
              <td class="actions">${r.project_id && hasCadrage(session) ? `<button class="btn sm ghost" data-proj="${r.project_id}">Voir et commenter</button>` : ""}<button class="iconbtn danger" data-rm="${r.user_id}" title="Retirer de la session" aria-label="Retirer">✕</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">Personne n'a encore rejoint la session.</p>`}
          </div>
          <div class="card" style="margin-top:14px">
            <h3>Invitations par e-mail</h3>
            ${session.access_mode === "invites" ? `<p class="small" style="margin:0 0 6px"><span class="pill">Sur invitation</span> ${T("Seules ces adresses peuvent demander un code d'accès (réglage dans l'onglet Réglages).")}</p>` : ""}
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
    let dragPause = null; // pause en cours de glisser-déposer : le redessin temps réel attend
    let bank = { ready: false, items: [] }; // bibliothèque « Quiz et sondages » (chargée après l'affichage)
    unplaceClock(); // le minuteur agrandi vit dans la colonne : il revient au bandeau avant le redessin
    box.innerHTML = `
      <div class="grid jour2">
        <div>
          <div class="clock-slot" id="clockSlot"></div>
          <div class="card">
            <h3>Pilotage</h3>
            <p class="small muted" id="hint" style="margin-top:0"></p>
            <div id="emRemind"></div><div id="pauseRemind"></div>
            <div class="kicker-d" style="margin:10px 0 2px">Écrans de la session · ouverture, pause et clôture</div>
            <p class="small muted" style="margin:0 0 6px">${T("Un clic projette l'écran, un second clic remet ce qui était projeté avant.")}</p>
            <div class="acts" id="opening"></div>
            <div class="kicker-d" style="margin:16px 0 6px">Déroulé · ce que voient les stagiaires et l'écran</div>
            <div id="modules"></div>
            <div id="decksBox"></div>
            <div class="kicker-d" style="margin:16px 0 6px">Activités hors déroulé</div>
            <div class="acts" id="acts"></div>
            <div id="ctrl" style="margin:12px 0"></div>
            <details style="margin-top:14px"><summary class="small" style="cursor:pointer">Ajouter, modifier ou retirer des activités</summary><div id="actEdit"></div></details>
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
          <div class="card chat-card" style="margin-top:14px"><h3>Discussion des stagiaires</h3><p class="small muted chat-note" id="chatOff" hidden></p><div id="chatAdm"></div></div>
        </aside>
      </div>`;
    placeClock();
    /* Discussion : ouverte aux stagiaires en formation en ligne seulement (chat_open côté base). En salle, le widget
       laisse la place à une ligne d'explication ; il se monte quand on active « Formation en ligne ». */
    let chatStop = null;
    const drawChat = () => {
      const on = chatOn(session), off = $("#chatOff", box), c = $("#chatAdm", box);
      if (!off || !c) return;
      off.textContent = on ? "" : fr(session.status === "closed"
        ? "Session close : les stagiaires n'y ont plus accès. L'historique reste dans l'onglet Après."
        : "Fermée aux stagiaires pendant une formation en salle. Elle s'ouvre quand vous activez « Formation en ligne ».");
      off.hidden = on; c.hidden = !on;
      if (on && !chatStop) chatStop = mountChat(c, { api, sid, me: ctx.me, staff: true, compact: true });
    };
    drawChat(); cleanups.push(() => chatStop && chatStop());
    afterOnline = drawChat;
    $("#openScr", box).onclick = () => window.open(`#/ecran/${sid}`, "ecran-" + sid, "popup=yes,width=1280,height=760");
    afterLive = () => draw(); // bascule du QR code de l'en-tête : l'aperçu suit
    // Remise à zéro du direct (après des essais) : salle fermée, état diffusé vidé ; rien d'autre n'est touché
    $("#resetLive", box).onclick = async () => {
      if (!confirm("Remettre le direct à zéro ?\n\nLa salle sera fermée. La séquence lancée, les outils d'exercice débloqués, les émargements déjà projetés et l'heure d'ouverture du jour seront effacés. Les inscrit·es, les réponses et la discussion sont conservés.")) return;
      session = await guard(() => api.updateSession(sid, { status: "draft", live: {} }), "Direct remis à zéro : salle fermée.") || session;
      draw(); // l'en-tête suit : draw appelle tick, qui met à jour l'horloge et le bouton de la salle
    };
    $("#closeDay", box).onchange = async (e) => { session = await guard(() => api.updateSession(sid, e.target.checked ? { status: "closed", live: {} } : { status: "live", live: { ...(session.live || {}), started: stamp(session.live) } }), e.target.checked ? "Journée close." : "Session rouverte.") || session; draw(); drawChat(); };

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
    // Écran d'ouverture, de pause ou de clôture : ce qui était projeté est gardé de côté (live.prev), pour le second clic.
    // L'évaluation débloque le support (sessions.support_unlocked) : avec un lien d'évaluation, chaque stagiaire
    // le télécharge une fois « Remplir l'évaluation » touché ; sans lien, tout de suite.
    const show = async (view, extra = {}) => {
      const l = session.live || {};
      const prev = OPENING_VIEWS.has(view) ? (l.view === view ? l.prev : stash(l)) : undefined;
      const live = { ...keep(), view, ...extra, ...(prev ? { prev } : {}), started_at: new Date().toISOString() };
      const patch = view === "evaluation" && !session.support_unlocked ? { support_unlocked: true } : {};
      if (patch.support_unlocked) toast(session.evaluation_url ? "Évaluation projetée : chaque stagiaire débloque le support en touchant « Remplir l'évaluation »." : "Évaluation projetée : le support est débloqué pour les stagiaires.", "ok");
      if (session.status !== "live" && (view === null || OPENING_VIEWS.has(view))) {
        session = await guard(() => api.updateSession(sid, { live, ...patch })) || session;
        return draw();
      }
      return setLive(live, patch);
    };
    // Second clic sur l'écran projeté : l'écran précédent revient (salle ouverte ou non, sans l'ouvrir)
    const back = async () => {
      session = await guard(() => api.updateSession(sid, { live: unstash(session.live || {}) }), "Retour à l'écran précédent.") || session;
      draw();
    };
    let modDay = 1;
    // Flèches du clavier (et télécommandes de présentation) : page suivante / précédente
    const onKey = (e) => {
      const dir = pageKey(e); if (!dir) return;
      const nl = stepLive(session, dir); if (!nl) return;
      e.preventDefault(); setLive(nl);
    };
    document.addEventListener("keydown", onKey); cleanups.push(() => document.removeEventListener("keydown", onKey));
    /* Activité suivante : dans le déroulé, la suivante de la même séquence ; hors déroulé, la suivante de la liste */
    const nextAct = (a) => {
      const mid = actPlace(session, a);
      const L = mid ? actsByModule(session).get(mid) || [] : session.activities.filter((x) => !actPlace(session, x));
      return L[L.findIndex((x) => x.id === a.id) + 1] || null;
    };
    const launch = async (act) => {
      const mods = modulesFor(session), mid = actPlace(session, act, mods);
      const ahead = mid && mods.findIndex((m) => m.id === mid) > mods.findIndex((m) => m.id === session.live?.module); // jamais de retour en arrière dans le parcours
      const live = { ...keep(), ...(ahead ? { module: mid } : {}), view: "activity", act: act.id, qi: 0, reveal: false, started_at: new Date().toISOString() };
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
      const autoPause = live.started?.day === parisDay() ? "pause" : ""; // rien de projeté après une ouverture du jour : l'écran montre la pause
      $("#opening", box).innerHTML = [["title", "Slide de titre", "Titre, logos, dates, QR"], ["emargement", "Émargement", session.emargement_url || session.emargement_qr ? "QR de l'organisme" : "À configurer"], ["trainer", "Formateur", session.trainer_id ? "Fiche de l'intervenant" : "À choisir"], ["support", "Support", "Annonce du téléchargement"], ["evaluation", "Évaluation", session.evaluation_url || session.evaluation_qr ? "QR et lien du formulaire" : "À configurer"], ["pause", "Pause", "Tasse de café animée"]]
        .map(([v, l, sub]) => { const on = (V || autoPause) === v && !act, again = V === v && !act;
          return `<button class="act${on ? " on" : ""}" data-view="${v}" aria-pressed="${on}" title="${again ? "Second clic : revenir à l'écran précédent" : "Projeter cet écran (un second clic remet l'écran précédent)"}"><span>${v ? "▣" : "□"}</span>${l}<small>${T(sub)}</small></button>`; }).join("");
      $$("[data-view]", box).forEach((b) => (b.onclick = () => {
        if (V === b.dataset.view && !act) return back(); // second clic : l'écran précédent revient
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
      // all : déroulé effectif (heures de fin appliquées) ; base : déroulé sur lequel se déplacent les pauses
      const all = modulesFor(session), base = baseModules(session), mods = all.filter((m) => m.type !== "pause");
      const cur = mods.find((m) => m.id === live.module);
      if (cur?.day) modDay = cur.day;
      // les pauses figurent dans le déroulé du pilotage ; celles de 15 min se déplacent (glisser-déposer ou ↑ ↓)
      const nD = daysOf(session).n; // journées du déroulé (1 à 5)
      if (modDay > nD) modDay = 1;
      const shown = all.filter((m) => nD === 1 || (m.day || 1) === modDay);
      const shownDay = nD > 1 ? modDay : 1;
      const pauseRow = (m) => {
        const lunch = isLunch(m), d = mins(m.t[1]) - mins(m.t[0]);
        const mv = (dir) => `<button type="button" class="iconbtn" data-pmove="${dir}" data-pid="${esc(m.id)}" aria-label="${dir < 0 ? "Avancer" : "Retarder"} la pause d'une séquence"${shiftPause(base, m.id, dir) ? "" : " disabled"}>${dir < 0 ? "↑" : "↓"}</button>`;
        return `<div class="modrow pauserow${lunch ? " lunch" : ""}" data-mid="${esc(m.id)}"${lunch ? "" : ` draggable="true" data-pid="${esc(m.id)}" title="Glisser pour placer la pause entre deux autres séquences de la demi-journée"`}>
          ${lunch ? "" : `<span class="drag" aria-hidden="true">⠿</span>`}<button type="button" data-pjpause title="Projeter l'écran Pause"><span class="mono small">${hhmmT(m.t[0])}</span><span class="pill pause">${T(m.titre)}</span><span class="small muted">${d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${String(d % 60).padStart(2, "0")}` : ""}` : `${d} min`}</span></button>
          ${lunch ? "" : `<span class="pause-move">${mv(-1)}${mv(1)}</span>`}</div>`;
      };
      // Dernière ligne de la journée : heure de fin modifiable ; l'après-midi se recale (programme.js, applyEnds)
      const endRow = (day) => {
        const b = endBounds(base, day), eff = dayEnd(all, day);
        if (!eff) return "";
        const changed = b && eff !== b.base;
        return `<div class="modrow endrow${changed ? " changed" : ""}">
          <span class="pill fin">Fin de la journée</span>
          ${b ? `<input type="time" class="endtime" step="300" min="${b.min}" max="${b.max}" value="${eff}" data-endday="${day}" aria-label="Heure de fin du jour ${day}">` : `<span class="mono small">${hhmmT(eff)}</span>`}
          <span class="small muted">${b ? T(changed ? `au lieu de ${hhmmT(b.base)} · après-midi recalculé` : "modifiable : l'après-midi se recale, le bilan garde sa durée") : T("aucune séquence à recaler l'après-midi")}</span>
          ${changed ? `<button type="button" class="linkbtn" data-endreset="${day}">Rétablir ${hhmmT(b.base)}</button>` : ""}</div>`;
      };
      const skip = skipSet(session), hidden = (m) => parsePages(m.pages).filter((p) => skip.has(p)).length; // pages masquées de la séquence
      const imported = session.programme?.modules?.length && session.programme.base !== "defaut", lvl = levelOf(session);
      const lvlBar = session.format === "2" && modDay === 2 ? `<div class="lvlbar"><span class="small muted">Niveau du jour 2</span><div class="days" role="group" aria-label="Niveau du jour 2">${[["expert", "Expert", "Déroulé d'origine : assistants, jargon, paliers, S·V·E"], ["debutant", "Débutant", "R·M·C·T·F, puis ateliers en groupe sur vos tâches et vos conducteurs"]].map(([v, l, t]) => `<button type="button" data-lvl="${v}" aria-pressed="${lvl === v}" title="${esc(t)}"${imported ? " disabled" : ""}>${l}</button>`).join("")}</div>${imported ? `<span class="small muted">${T("Conducteur importé : le niveau ne s'applique pas.")}</span>` : `<span class="small muted">${T(lvl === "debutant" ? "R·M·C·T·F, puis ateliers en groupe." : "Déroulé d'origine.")}</span>`}</div>` : "";
      const placed = actsByModule(session);
      // Activités placées sous leur séquence : un clic lance, ✕ retire du déroulé (l'activité reste dans la session)
      const actRows = (m) => (placed.get(m.id) || []).map((a) => {
        const n = a.type === "quiz" ? quizFor(session, a.quiz)?.questions.length || 0 : 0, isOn = act?.id === a.id;
        return `<div class="modrow actrow${isOn ? " on" : ""}"><button type="button" data-a="${esc(a.id)}"><span class="mono small" aria-hidden="true">↳</span><span class="pill actp">${T(ACT_TYPES[a.type] || "Activité")}</span><span class="modtxt"><b>${T(a.titre)}</b>${n ? `<small>${n} question${n > 1 ? "s" : ""}${isOn ? ` · question ${(live.qi || 0) + 1} à l'écran` : ""}</small>` : ""}</span></button><button type="button" class="iconbtn actout" data-unplace="${esc(a.id)}" title="${esc(fr("Retirer du déroulé (l'activité reste dans la session)"))}" aria-label="${esc(fr(`Retirer « ${a.titre} » du déroulé`))}">✕</button>${isOn ? `<div class="act-ctrl" data-ctrl-for="${esc(a.id)}"></div>` : ""}</div>`;
      }).join("");
      $("#modules", box).innerHTML = `${nD > 1 ? `<div class="days" style="margin:0 0 8px">${Array.from({ length: nD }, (_, i) => i + 1).map((d) => `<button type="button" data-mday="${d}" aria-pressed="${d === modDay}">Jour ${d}</button>`).join("")}</div>` : ""}${lvlBar}
        <div class="modlist">${interleave(shown, slots.filter((x) => nD === 1 || x.day === modDay)).map((m) => {
          if (m.slot) return `<div class="modrow em${emDone[m.key] ? " done" : ""}${(V === "emargement" || V === "evaluation") && live.emKey === m.key ? " on" : ""}"><button type="button" data-em="${m.key}"><span class="mono small">${hhmmT(m.t)}</span><span class="pill tf">${m.kind === "evaluation" ? "Évaluation" : "Émargement"}</span><b>${T(m.label)}</b>${emDone[m.key] ? `<span class="small muted" style="margin-left:auto">✓ présenté à ${new Date(emDone[m.key]).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}</button></div>`;
          if (m.type === "pause") return pauseRow(m);
          const on = m.id === live.module, pages = modPages(session, m);
          return `<div class="modrow${on ? " on" : ""}" data-mid="${esc(m.id)}"><button type="button" class="iconbtn modadd" data-addact="${esc(m.id)}" title="${esc(fr(`Ajouter un quiz ou un sondage à « ${m.titre} »`))}" aria-label="${esc(fr(`Ajouter une activité à « ${m.titre} »`))}">+</button><button type="button" data-mod="${m.id}"><span class="mono small">${hhmmT(m.t[0])}</span><span class="pill ${m.type}">${T(typeLabel(m.type))}</span><span class="modtxt"><b>${T(m.titre)}</b>${m.cas ? `<small>${T(m.cas)}</small>` : ""}</span></button>
            ${on && pages.length && session.slides_url ? `<div class="slidebar"><button type="button" class="iconbtn" data-sl="prev" aria-label="Page précédente">←</button>${pages.map((p) => `<button type="button" class="chip${V === "slide" && live.slide === p ? " on" : ""}" data-page="${p}">${p}</button>`).join("")}<button type="button" class="iconbtn" data-sl="next" aria-label="Page suivante">→</button>${hidden(m) ? `<span class="small muted" title="Réglages → Slides projetées">${hidden(m)} masquée${hidden(m) > 1 ? "s" : ""}</span>` : ""}</div>` : ""}
            ${on && pages.length && !session.slides_url ? `<div class="small muted" style="padding:4px 8px">Pages ${T(m.pages)} · associez la présentation dans l'onglet Réglages pour les projeter.</div>` : ""}</div>${actRows(m)}`;
        }).join("")}${endRow(shownDay)}</div>`;
      $$("[data-mday]", box).forEach((b) => (b.onclick = () => { modDay = +b.dataset.mday; draw(); }));
      $$("[data-lvl]", box).forEach((b) => (b.onclick = () => b.dataset.lvl !== lvl && setLevel(b.dataset.lvl)));
      bindPauses(base);
      bindEnds();
      $$("[data-em]", box).forEach((b) => (b.onclick = () => showEm(b.dataset.em)));
      $$("[data-addact]", box).forEach((b) => (b.onclick = () => openAddSheet(b.dataset.addact)));
      $$("[data-unplace]", box).forEach((b) => (b.onclick = () => placeAct(b.dataset.unplace, "")));
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
      const loose = session.activities.filter((a) => !actPlace(session, a));
      $("#acts", box).innerHTML = loose.length ? loose.map((a, i) => `<button class="act${act?.id === a.id ? " on" : ""}" data-a="${esc(a.id)}"><span>${i + 1}</span>${T(a.titre)}<small>${ACT_TYPES[a.type]}</small></button>`).join("")
        : `<p class="small muted" style="margin:0;grid-column:1/-1">${T("Toutes les activités sont placées dans le déroulé. Le « + » d'une séquence en ajoute une.")}</p>`;
      $$("[data-a]", box).forEach((b) => (b.onclick = () => launch(session.activities.find((a) => a.id === b.dataset.a))));
      let c = "";
      if (act) {
        const desc = { welcome: "Accueil affiché à l'écran, avec le QR code.", cloud: "Ils envoient leurs mots ; le nuage se forme à l'écran.", poll: "Ils répondent au sondage ; les résultats s'affichent à l'écran.", quiz: "Ils répondent ; affichez la bonne réponse quand tout le monde a voté.", vote: "Ils votent pour un cas d'usage.", projects: "Les cas d'usage validés défilent à l'écran." }[act.type];
        c = `<p class="small" style="margin:0 0 8px">${T(desc)}</p><div class="chips">`;
        if (act.type === "quiz") {
          const n = quizFor(session, act.quiz)?.questions.length || 0, qi = live.qi || 0;
          c += `<button class="btn sm ghost" data-q="-1" ${qi === 0 ? "disabled" : ""}>← Question précédente</button>
            <button class="btn sm" data-rev ${live.reveal ? "disabled" : ""}>Afficher la réponse</button>
            <button class="btn sm ghost" data-q="1" ${qi >= n - 1 ? "disabled" : ""}>Question suivante →</button>`;
        }
        const nx = nextAct(act);
        if (nx) c += `<button class="btn sm ghost" data-next>Activité suivante : ${T(nx.titre)}</button>`;
        c += `<button class="btn sm ghost" data-stop>Arrêter l'activité</button></div>`;
      }
      const slot = act ? $(`[data-ctrl-for="${CSS.escape(act.id)}"]`, box) : null; // activité placée : ses commandes sous sa ligne
      if (slot) slot.innerHTML = c;
      $("#ctrl", box).innerHTML = slot ? "" : c;
      $$("[data-q]", box).forEach((b) => (b.onclick = () => setLive({ ...live, qi: (live.qi || 0) + +b.dataset.q, reveal: false })));
      $("[data-rev]", box)?.addEventListener("click", () => setLive({ ...live, reveal: true }));
      $("[data-next]", box)?.addEventListener("click", () => { const nx = nextAct(act); if (nx) launch(nx); });
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
    /* Pauses de 15 minutes : glisser-déposer (ou ↑ ↓) entre deux séquences de leur demi-journée. Le déroulé de la
       session est réécrit (sessions.programme ; à partir du déroulé par défaut si aucun conducteur n'est importé),
       horaires recalculés en cascade (programme.js). Le clic sur une pause projette l'écran Pause. */
    const savePauses = async (modules, pid) => {
      const D = daysOf(session);
      const programme = session.programme?.modules?.length ? { ...session.programme, modules }
        : { formation: session.formation, days: D.titles, nDays: D.n, modules, base: "defaut", ...(session.programme?.ends ? { ends: session.programme.ends } : {}), ...(session.programme?.level ? { level: session.programme.level } : {}) };
      const p = modulesFor({ ...session, programme }).find((m) => m.id === pid); // horaires effectifs (fin de journée appliquée)
      const s = await guard(() => api.updateSession(sid, { programme }), `Pause déplacée : ${hhmmT(p.t[0])} – ${hhmmT(p.t[1])}. Horaires de la demi-journée recalculés.`);
      if (s) session = s;
      draw();
    };
    /* Niveau du jour 2 (deux journées, déroulé par défaut) : expert = jour 2 d'origine, débutant = R·M·C·T·F puis
       ateliers en groupe (D2B). Gardé dans sessions.programme.level, sans copier le déroulé. Si le déroulé par défaut
       a déjà été copié (pauses déplacées), son jour 2 est remplacé et le jour 1 garde ses pauses. La séquence lancée
       qui n'existe plus est oubliée ; le nuage « La tâche pénible » est ajouté aux activités en niveau débutant. */
    const setLevel = async (level) => {
      const pr = session.programme || {};
      if (pr.modules?.length && pr.base !== "defaut") return toast("Conducteur importé : le niveau ne s'applique qu'au déroulé par défaut.", "ko");
      const { level: _old, ...rest } = pr;
      const programme = { ...rest, ...(level === "debutant" ? { level } : {}) };
      if (pr.modules?.length) {
        const day2 = defaultModules({ format: "2", programme: { level } }).filter((m) => m.day === 2);
        programme.modules = [...pr.modules.filter((m) => (m.day || 1) !== 2), ...day2];
        programme.days = { ...(pr.days || {}), 2: DAY_TITLES[level === "debutant" ? "debutant" : "expert"][2] };
      }
      const patch = { programme: Object.keys(programme).length ? programme : null };
      if (session.live?.module && !modulesFor({ ...session, ...patch }).some((m) => m.id === session.live.module)) patch.live = { ...session.live, module: null };
      if (level === "debutant" && !(session.activities || []).some((a) => a.id === "penible")) patch.activities = [...(session.activities || []), presetAct("penible", "La tâche pénible")];
      const s = await guard(() => api.updateSession(sid, patch), level === "debutant" ? "Jour 2 en niveau débutant : R·M·C·T·F le matin, ateliers en groupe l'après-midi. Parcours stagiaire et pilotage sont à jour." : "Jour 2 en niveau expert : déroulé d'origine.");
      if (s) session = s;
      draw();
    };
    /* Fin de la journée : heure enregistrée dans sessions.programme.ends (sans copier le déroulé par défaut).
       L'heure d'origine efface l'entrée. Les séquences de l'après-midi se recalent à l'affichage (applyEnds). */
    const saveEnd = async (day, v) => {
      const b = endBounds(baseModules(session), day); if (!b) return;
      if (v < b.min || v > b.max) { toast(v < b.min ? `Au plus tôt ${hhmmT(b.min)} : il faut garder les pauses, le bilan et 5 minutes par séquence de l'après-midi.` : `Au plus tard ${hhmmT(b.max)}.`, "ko"); return draw(); }
      const ends = { ...(session.programme?.ends || {}) };
      if (v === b.base) delete ends[day]; else ends[day] = v;
      const pr = { ...(session.programme || {}) };
      if (Object.keys(ends).length) pr.ends = ends; else delete pr.ends;
      const programme = Object.keys(pr).length ? pr : null;
      const bilan = modulesFor({ ...session, programme }).find((m) => m.id === b.bilan.id);
      const msg = v === b.base ? `Fin de la journée rétablie à ${hhmmT(v)} : horaires d'origine.` : `Fin de la journée à ${hhmmT(v)}. Après-midi recalculé : « ${b.bilan.titre} » à ${hhmmT(bilan.t[0])}.`;
      const s = await guard(() => api.updateSession(sid, { programme }), msg);
      if (s) session = s;
      draw();
    };
    const bindEnds = () => {
      $$("[data-endday]", box).forEach((inp) => {
        const day = +inp.dataset.endday, first = inp.value;
        let tm = null, sent = false;
        const commit = () => { clearTimeout(tm); tm = null; if (sent || !inp.value || inp.value === first) return; sent = true; saveEnd(day, inp.value); };
        // la saisie au clavier change l'heure, puis les minutes : seule une heure possible s'enregistre d'office, après une courte attente ;
        // une heure hors bornes n'est signalée qu'en quittant le champ ou avec Entrée
        inp.onchange = () => { clearTimeout(tm); if (inp.value >= inp.min && inp.value <= inp.max) tm = setTimeout(commit, 1500); };
        inp.onblur = commit;
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } };
      });
      $$("[data-endreset]", box).forEach((b) => (b.onclick = () => { const d = +b.dataset.endreset, bd = endBounds(baseModules(session), d); if (bd) saveEnd(d, bd.base); }));
    };
    const clearDrop = () => $$(".drop-ok, .drop-before, .dragging", box).forEach((r) => r.classList.remove("drop-ok", "drop-before", "dragging"));
    const bindPauses = (all) => {
      $$("[data-pjpause]", box).forEach((b) => (b.onclick = () => show("pause")));
      $$("[data-pmove]", box).forEach((b) => (b.onclick = () => { const nm = shiftPause(all, b.dataset.pid, +b.dataset.pmove); if (nm) savePauses(nm, b.dataset.pid); }));
      $$(".pauserow[draggable]", box).forEach((row) => {
        row.ondragstart = (e) => {
          dragPause = row.dataset.pid;
          e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragPause);
          const ok = new Set(pauseTargets(all, dragPause));
          row.classList.add("dragging");
          $$(".modrow[data-mid]", box).forEach((r) => r.classList.toggle("drop-ok", ok.has(r.dataset.mid)));
        };
        row.ondragend = () => { dragPause = null; clearDrop(); };
      });
      $$(".modrow[data-mid]", box).forEach((r) => {
        r.ondragover = (e) => {
          if (!dragPause || !r.classList.contains("drop-ok")) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "move";
          $$(".drop-before", box).forEach((x) => x !== r && x.classList.remove("drop-before"));
          r.classList.add("drop-before");
        };
        r.ondragleave = (e) => { if (!r.contains(e.relatedTarget)) r.classList.remove("drop-before"); };
        r.ondrop = (e) => {
          e.preventDefault();
          const pid = dragPause; dragPause = null; clearDrop();
          const nm = pid ? movePause(all, pid, r.dataset.mid) : null;
          if (nm) savePauses(nm, pid);
        };
      });
    };
    // Alerte du pilotage : la pause (ou le déjeuner) commence dans deux minutes. « OK » la masque jusqu'à la pause suivante.
    let pauseOff = null;
    const pauseTick = () => {
      const el = $("#pauseRemind", box); if (!el) return;
      const a = session.status === "closed" ? null : pauseAlert(modulesFor(session), (d) => dateOfDay(session, d));
      const key = a ? `${a.m.day || 1}:${a.m.id}:${a.m.t[0]}` : "";
      const txt = a && key !== pauseOff ? pauseAlertText(a) : "";
      if (el.dataset.k === key + txt) return;
      el.dataset.k = key + txt;
      if (!txt) { el.innerHTML = ""; return; }
      el.innerHTML = `<div class="pause-alert" role="status"><b>${T(txt)}</b><span class="small">${T(`${isLunch(a.m) ? "Déjeuner prévu" : "Pause prévue"} à ${hhmmT(a.m.t[0])}`)}</span>
        <div class="chips"><button type="button" class="btn sm" data-pa="pj">Projeter l'écran Pause</button><button type="button" class="btn sm ghost" data-pa="ok">OK</button></div></div>`;
      $('[data-pa="pj"]', el).onclick = () => show("pause");
      $('[data-pa="ok"]', el).onclick = () => { pauseOff = key; pauseTick(); };
    };
    /* Activités de la session : ajouter depuis la bibliothèque, créer pour cette session, modifier, monter, retirer.
       Les quiz de la session sont des copies (sessions.quizzes) : rien n'est écrit dans la bibliothèque.
       Une activité qui a déjà reçu des réponses est verrouillée : on la duplique pour la modifier. */
    const quizActTitle = (t) => (/^quiz\b/i.test(t) ? t : `Quiz · ${t}`).slice(0, 60); // pas de « Quiz · Quiz… »
    const actKind = (a) => (a.type === "quiz" || a.type === "poll" || a.type === "cloud" ? a.type : null);
    const bankItemOf = (a) => {
      if (a.type === "quiz") { const c = session.quizzes?.[a.quiz]; return bank.items.find((b) => b.kind === "quiz" && b.id === (c ? c.from : a.quiz)) || null; }
      if (a.type === "poll" || a.type === "cloud") return bank.items.find((b) => b.kind === a.type && b.id === (a.from || a.id)) || null;
      return null;
    };
    const isOutdated = (a) => { const it = bankItemOf(a); return !!it && outdated(a.type === "quiz" ? quizFor(session, a.quiz) : a, it); };
    const uniqueActId = (base) => (base && !session.activities.some((a) => a.id === base) ? base : "a" + Date.now().toString(36));
    // Activités qui partagent ces réponses : un quiz copié peut servir à plusieurs activités
    const hasAnswers = async (a) => {
      const acts = a.type === "quiz" ? session.activities.filter((x) => x.type === "quiz" && x.quiz === a.quiz) : [a];
      const keys = acts.flatMap((x) => respKeys(x, session));
      const rows = await Promise.all(keys.map((k) => api.results(sid, k).catch(() => [])));
      return rows.some((r) => r.length);
    };
    const saveSession = async (patch, msg) => { const s = await guard(() => api.updateSession(sid, patch), msg); if (s) { session = s; draw(); } return !!s; };
    const needBank = () => { if (bank.ready) return true; toast("Quiz modifiables après la migration 20261126000000_quiz_sondages.sql sur Supabase.", "ko"); return false; };
    const editSheet = (title, kind, value, draftKey, onSave) => {
      openSheet(`<span class="pill">Activité de la session</span><h2>${T(title)}</h2><p class="small muted">${T("Modifiée pour cette session seulement : la bibliothèque ne change pas.")}</p><div id="qeSheet"></div>`);
      mountEditor($("#qeSheet"), { kind, value, draftKey, saveLabel: "Enregistrer dans la session", onCancel: closeSheet, onSave: async (v) => { const done = await onSave(v); if (done) closeSheet(); return done; } });
    };
    // Duplique une activité (et la copie de son quiz) juste après l'originale, puis ouvre l'éditeur sur la copie
    const duplicateAct = async (a) => {
      const L = [...session.activities], i = L.findIndex((x) => x.id === a.id), id = uniqueActId();
      const patch = {};
      let copy;
      if (a.type === "quiz") {
        if (!needBank()) return;
        const src = quizFor(session, a.quiz), key = newItemId(src.titre, "s-");
        patch.quizzes = { ...(session.quizzes || {}), [key]: { titre: src.titre, questions: src.questions.map((q) => ({ ...q, o: [...q.o] })), from: null } };
        copy = { id, type: "quiz", titre: `${a.titre} (2)`.slice(0, 60), quiz: key };
      } else copy = { ...a, id, titre: `${a.titre} (2)`.slice(0, 60), from: null };
      L.splice(i + 1, 0, copy); patch.activities = L;
      if (await saveSession(patch, "Copie créée, juste après l'originale. Les réponses déjà données restent attachées à l'originale.")) editAct(copy);
    };
    const editAct = async (a) => {
      const kind = actKind(a); if (!kind) return;
      if (kind === "quiz" && !needBank()) return;
      if (await hasAnswers(a)) {
        openSheet(`<span class="pill">Activité de la session</span><h2>${T(a.titre)}</h2>
          <p>${T("Cette activité a déjà reçu des réponses : la modifier fausserait leur lecture.")}</p>
          <p class="small muted">${T("Dupliquez-la pour en faire une nouvelle version. Les réponses déjà données restent attachées à l'originale, toujours visibles dans l'onglet Après.")}</p>
          <div class="chips"><button class="btn sm" id="dupAct">Dupliquer pour modifier</button><button class="btn sm ghost" id="noAct">Annuler</button></div>`);
        $("#dupAct").onclick = () => duplicateAct(a);
        $("#noAct").onclick = closeSheet;
        return;
      }
      if (kind === "quiz") {
        const cur = quizFor(session, a.quiz);
        editSheet(`Modifier « ${a.titre} »`, "quiz", valueOf("quiz", cur), `act:${sid}:${a.quiz}`, async (v) => {
          const prev = session.quizzes?.[a.quiz];
          const quizzes = { ...(session.quizzes || {}), [a.quiz]: { titre: v.titre, questions: v.questions, from: prev ? prev.from ?? null : a.quiz } };
          const activities = v.titre === cur.titre ? session.activities : session.activities.map((x) => (x.type === "quiz" && x.quiz === a.quiz ? { ...x, titre: quizActTitle(v.titre) } : x));
          return saveSession({ quizzes, activities }, "Quiz enregistré dans la session.");
        });
      } else {
        editSheet(`Modifier « ${a.titre} »`, kind, valueOf(kind, a), `act:${sid}:${a.id}`, (v) =>
          saveSession({ activities: session.activities.map((x) => (x.id === a.id ? { ...x, titre: v.titre, q: v.q, ...(kind === "poll" ? { o: v.o } : {}) } : x)) }, "Activité enregistrée."));
      }
    };
    const updateFromBank = async (a) => {
      const it = bankItemOf(a); if (!it) return;
      if (a.type === "quiz" && !needBank()) return;
      if (await hasAnswers(a)) return toast("Cette activité a déjà reçu des réponses : dupliquez-la plutôt (bouton Modifier).", "ko");
      if (!confirm(`Reprendre la version de la bibliothèque de « ${it.titre} » ? Les modifications faites dans cette session seront remplacées.`)) return;
      if (a.type === "quiz") await saveSession({ quizzes: { ...(session.quizzes || {}), [a.quiz]: copyOf(it) } }, "Quiz mis à jour depuis la bibliothèque.");
      else await saveSession({ activities: session.activities.map((x) => (x.id === a.id ? { ...x, q: it.content.q, ...(it.kind === "poll" ? { o: [...it.content.o] } : {}), from: it.id } : x)) }, "Activité mise à jour depuis la bibliothèque.");
    };
    const addFromBank = async (id, at) => {
      const it = bank.items.find((b) => b.id === id); if (!it) return;
      const pl = at ? { at } : {};
      if (it.kind === "quiz") {
        const a = { id: uniqueActId(), type: "quiz", titre: quizActTitle(it.titre), quiz: it.id, ...pl };
        await saveSession({ activities: [...session.activities, a], ...(bank.ready ? { quizzes: snapshotQuizzes(session.quizzes, [it.id], bank.items) } : {}) }, "Quiz ajouté.");
      } else await saveSession({ activities: [...session.activities, { ...pollActivity(it, uniqueActId(it.id)), ...pl }] }, at ? "Activité ajoutée au déroulé." : "Activité ajoutée.");
    };
    const createAct = (kind, at) => {
      const pl = at ? { at } : {};
      if (kind === "quiz" && !needBank()) return;
      editSheet(`Nouveau ${kind === "quiz" ? "quiz" : kind === "poll" ? "sondage" : "nuage de mots"} pour cette session`, kind, blankValue(kind), `act:${sid}:nouveau-${kind}`, (v) => {
        const id = uniqueActId();
        if (kind === "quiz") {
          const key = newItemId(v.titre, "s-");
          return saveSession({ quizzes: { ...(session.quizzes || {}), [key]: { titre: v.titre, questions: v.questions, from: null } }, activities: [...session.activities, { id, type: "quiz", titre: quizActTitle(v.titre), quiz: key, ...pl }] }, at ? "Quiz créé et placé dans le déroulé." : "Quiz créé pour cette session.");
        }
        return saveSession({ activities: [...session.activities, { id, type: kind, titre: v.titre, q: v.q, ...(kind === "poll" ? { o: v.o } : {}), ...pl }] }, at ? "Activité créée et placée dans le déroulé." : "Activité créée pour cette session.");
      });
    };
    /* Placer une activité dans une séquence du déroulé ("" : hors déroulé). Rien d'autre ne change : ni ses
       réponses, ni sa place dans la liste. */
    const placeAct = (id, at) => {
      const a = session.activities.find((x) => x.id === id); if (!a) return;
      const m = at ? modulesFor(session).find((x) => x.id === at) : null;
      return saveSession({ activities: session.activities.map((x) => (x.id === id ? { ...x, at } : x)) }, m ? `« ${a.titre} » placé dans « ${m.titre} ».` : `« ${a.titre} » retiré du déroulé. Il reste dans les activités hors déroulé.`);
    };
    const modLabel = (m) => `${daysOf(session).n > 1 ? `J${m.day || 1} · ` : ""}${hhmmT(m.t[0])} · ${m.titre}`;
    // « + » d'une séquence : placer une activité de la session, en ajouter une de la bibliothèque, ou en créer une
    const openAddSheet = (mid) => {
      const mods = modulesFor(session), m = mods.find((x) => x.id === mid); if (!m) return;
      const grp = (k, label) => { const L = bank.items.filter((b) => b.kind === k); return L.length ? `<optgroup label="${label}">${L.map((b) => `<option value="${esc(b.id)}">${T(b.titre)}</option>`).join("")}</optgroup>` : ""; };
      const rows = session.activities.filter((a) => a.type !== "welcome").map((a) => {
        const at = actPlace(session, a, mods), where = at ? mods.find((x) => x.id === at) : null;
        return `<div class="prow act-row"><span>${T(a.titre)} <small class="muted">${ACT_TYPES[a.type]}${where ? ` · ${at === mid ? "déjà ici" : T(`dans « ${where.titre} »`)}` : " · hors déroulé"}</small></span>${at === mid ? "" : `<button class="btn sm ghost" type="button" data-placehere="${esc(a.id)}">${where ? "Déplacer ici" : "Placer ici"}</button>`}</div>`;
      }).join("");
      openSheet(`<span class="pill">Déroulé</span><h2>Ajouter une activité</h2><p class="muted" style="margin-top:0">${T(`À « ${m.titre} », ${daysOf(session).n > 1 ? `jour ${m.day || 1}, ` : ""}${hhmmT(m.t[0])}. Elle s'affichera sous la séquence, dans le pilotage : un clic la lance, les flèches y passent après les pages de la séquence.`)}</p>
        <h3 style="margin-top:16px">Créer pour cette séquence</h3>
        <div class="chips"><button class="btn sm" type="button" data-createat="quiz">Quiz</button><button class="btn sm" type="button" data-createat="poll">Sondage</button><button class="btn sm" type="button" data-createat="cloud">Nuage de mots</button></div>
        <h3 style="margin-top:16px">Depuis la bibliothèque</h3>
        ${bank.items.length ? `<div class="askrow"><select id="shBank" aria-label="Élément de la bibliothèque">${grp("quiz", "Quiz")}${grp("poll", "Sondages")}${grp("cloud", "Nuages de mots")}</select><button class="btn sm" type="button" id="shBankAdd">Ajouter ici</button></div>` : `<p class="small muted">${T("Bibliothèque en cours de chargement, ou vide.")}</p>`}
        <h3 style="margin-top:16px">Activités de la session</h3>
        ${rows || `<p class="small muted">Aucune activité.</p>`}`);
      $$("[data-createat]").forEach((b) => (b.onclick = () => createAct(b.dataset.createat, mid)));
      $("#shBankAdd")?.addEventListener("click", async () => { const v = $("#shBank").value; closeSheet(); await addFromBank(v, mid); });
      $$("[data-placehere]").forEach((b) => (b.onclick = async () => { closeSheet(); await placeAct(b.dataset.placehere, mid); }));
    };
    const drawEdit = () => {
      const grp = (k, label) => { const L = bank.items.filter((b) => b.kind === k); return L.length ? `<optgroup label="${label}">${L.map((b) => `<option value="${esc(b.id)}">${T(b.titre)}</option>`).join("")}</optgroup>` : ""; };
      const seqMods = modulesFor(session), seqList = seqMods.filter((m) => m.type !== "pause");
      const seqOpts = (cur) => seqList.map((m) => `<option value="${esc(m.id)}"${m.id === cur ? " selected" : ""}>${T(modLabel(m).slice(0, 70))}</option>`).join("");
      $("#actEdit", box).innerHTML = `
        ${session.activities.map((a, i) => `<div class="prow act-row"><span>${i + 1}. ${T(a.titre)} <small class="muted">${ACT_TYPES[a.type]}${a.type === "quiz" ? ` · ${quizFor(session, a.quiz)?.questions.length || 0} q.` : ""}</small>${isOutdated(a) ? ` <button class="linkbtn small" data-upd="${i}" title="${esc(fr("La bibliothèque a une version différente de cette activité"))}">Mettre à jour depuis la bibliothèque</button>` : ""}</span>
          <span class="act-tools">${a.type !== "welcome" ? `<select class="act-at" data-at="${i}" aria-label="${esc(fr(`Séquence de « ${a.titre} »`))}"><option value="">Hors déroulé</option>${seqOpts(actPlace(session, a, seqMods))}</select>` : ""}${actKind(a) ? `<button class="linkbtn small" data-edit="${i}">Modifier</button>` : ""}<button class="iconbtn" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Monter « ${esc(a.titre)} »">↑</button><button class="iconbtn danger" data-drop="${i}" aria-label="Retirer « ${esc(a.titre)} »">✕</button></span></div>`).join("")}
        <div class="card act-add">
          <label class="f" for="aBank">Ajouter depuis la bibliothèque</label>
          <div class="askrow"><select id="aBank">${grp("quiz", "Quiz")}${grp("poll", "Sondages")}${grp("cloud", "Nuages de mots")}</select><button class="btn sm" type="button" id="aBankAdd"${bank.items.length ? "" : " disabled"}>Ajouter</button></div>
          <div class="f qe-lbl">Créer pour cette session</div>
          <div class="chips"><button class="btn sm ghost" type="button" data-create="quiz">Quiz</button><button class="btn sm ghost" type="button" data-create="poll">Sondage</button><button class="btn sm ghost" type="button" data-create="cloud">Nuage de mots</button></div>
          <p class="small muted" style="margin:8px 0 0">${T(admin ? "Les modèles partagés se gèrent dans « Quiz et sondages », depuis la liste des sessions." : "Les modèles partagés sont gérés par l'administration.")}</p>
          <button class="linkbtn small" type="button" id="aReset" style="margin-top:6px">Revenir à la séquence par défaut</button>
        </div>`;
      const saveActs = (activities) => saveSession({ activities, ...(bank.ready ? { quizzes: snapshotQuizzes(session.quizzes, quizKeysOf(activities, modulesFor(session)), bank.items) } : {}) });
      $$("[data-up]", box).forEach((b) => (b.onclick = () => { const L = [...session.activities], i = +b.dataset.up; [L[i - 1], L[i]] = [L[i], L[i - 1]]; saveActs(L); }));
      $$("[data-drop]", box).forEach((b) => (b.onclick = () => saveActs(session.activities.filter((_, i) => i !== +b.dataset.drop))));
      $$("[data-edit]", box).forEach((b) => (b.onclick = () => editAct(session.activities[+b.dataset.edit])));
      $$("[data-at]", box).forEach((sel) => (sel.onchange = () => placeAct(session.activities[+sel.dataset.at].id, sel.value)));
      $$("[data-upd]", box).forEach((b) => (b.onclick = () => updateFromBank(session.activities[+b.dataset.upd])));
      $$("[data-create]", box).forEach((b) => (b.onclick = () => createAct(b.dataset.create)));
      $("#aBankAdd", box).onclick = () => addFromBank($("#aBank", box).value);
      $("#aReset", box).onclick = () => confirm("Remplacer la séquence par celle proposée par défaut ?") && saveActs(defaultActivities(session.format, bank.items));
    };
    await draw();
    // Bibliothèque chargée après l'affichage du pilotage (rien ne ralentit l'ouverture du Jour J)
    api.listBank().then((b) => { bank = b; drawEdit(); }).catch(() => {});
    const redraw = debounce(() => { if (dragPause) return; if (!box.contains(document.activeElement) || document.activeElement.tagName === "BUTTON") draw(); }, 300);
    pauseTick(); const pauseT = setInterval(pauseTick, 5000); cleanups.push(() => clearInterval(pauseT));
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
        <div class="chips">${hasCadrage(session) ? `<a class="btn sm" href="#projets">Voir les projets</a>` : ""}<a class="btn sm ghost" href="#/admin/participants/emargements/${sid}">Feuille d'émargement</a><a class="btn sm ghost" href="#emarg">Présences, bilan et duplication</a><a class="btn sm ghost" href="#resultats">Résultats à l'écran</a></div></div>

${hasCadrage(session) ? `      <div class="card" id="projets" style="margin-top:14px"><h3>Projets (${projects.length})</h3>
        ${projects.length ? `<div class="grid g2">${projects.map((p) => `<div class="proj-card"><span class="tag${p.status === "validated" ? " ok" : ""}">${p.status === "validated" ? "✓ Validé" : "En cours"}</span><b>${T(p.data?.retenu?.titre || "Sans titre")}</b><div class="small muted">${T(by[p.user_id]?.full_name || by[p.user_id]?.email || "")}</div><p class="small">${T((p.data?.retenu?.description || "").slice(0, 260))}</p>${p.trainer_comment ? `<p class="small"><b>Votre retour :</b> ${T(p.trainer_comment)}</p>` : ""}</div>`).join("")}</div>` : `<p class="empty">Aucun cadrage.</p>`}</div>` : ""}

      <div class="card" id="emarg" style="margin-top:14px"><h3>Émargement</h3>
        ${roster.length ? `<table class="tbl"><thead><tr><th>Présent·e</th><th>Nom</th><th>E-mail</th><th>Cadrage</th></tr></thead><tbody>${roster.map((r) => `<tr><td><input type="checkbox" data-att="${r.user_id}"${r.attended ? " checked" : ""} aria-label="Présence de ${esc(r.full_name || r.email)}"></td><td>${T(r.full_name || "—")}</td><td class="small">${esc(r.email || "—")}</td><td class="small">${r.project_status === "validated" ? "Validé" : r.project_id ? `${r.project_steps}/${STEPS.length}` : "—"}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Aucun participant.</p>`}
        <div class="chips" style="margin-top:12px"><button class="btn sm" id="csv">Exporter le bilan (CSV)</button>${admin ? `<button class="btn sm ghost" id="dup">Dupliquer la session</button>` : ""}</div>
        <p class="small muted">${T("Le bilan reprend présence, profil, état du cadrage, progression dans le déroulé et scores aux quiz. La duplication reprend la séquence, les ressources et les intitulés des accès (sans les valeurs), sans participant·es.")}</p></div>

      <div class="card chat-card" id="discussion" style="margin-top:14px"><h3>Discussion des stagiaires</h3><p class="small muted chat-note">${T("Ouverte aux stagiaires en formation en ligne, jusqu'à la clôture. Vous gardez l'historique.")}</p><div id="chatAdm"></div></div>

      <div class="card" id="resultats" style="margin-top:14px"><h3>Résultats des activités</h3><div id="resBox" class="grid g2"><p class="small muted">Chargement…</p></div></div>

      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Ressources de la session</h3><p class="small muted" style="margin-top:0">Visibles par les participant·es dans « Ressources du jour ».</p>
          ${resources.map((r) => `<div class="prow"><a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${T(r.title)} ↗</a><button class="iconbtn danger" data-rres="${r.id}" aria-label="Retirer">✕</button></div>`).join("")}
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
      const quizzes = [...new Set([...quizKeysOf(session.activities, modulesFor(session)), ...Object.keys(session.quizzes || {})])].filter((k) => quizFor(session, k));
      const head = ["Nom", "E-mail", "Présent", "Métier", "Niveau IA", "Cadrage", "Cas d'usage", "Retour formateur", "Déroulé (séquences cochées)", ...quizzes.map((q) => "Quiz " + quizFor(session, q).titre)];
      const lines = roster.map((r) => {
        const p = projects.find((x) => x.user_id === r.user_id);
        return [r.full_name, r.email, r.attended ? "oui" : "non", r.metier, r.niveau, r.project_status === "validated" ? "validé" : r.project_id ? `${r.project_steps}/${STEPS.length}` : "non commencé",
          p?.data?.retenu?.titre, p?.trainer_comment, Object.values(r.progress?.done || {}).filter(Boolean).length, ...quizzes.map((q) => r.progress?.quiz?.[q] ?? "")];
      });
      // Une cellule qui commence par = + - @ (ou tabulation, retour chariot) serait lue comme une formule par le tableur :
      // on la préfixe d'une apostrophe (« injection de formule »)
      const cell = (v) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
      const csv = [head, ...lines].map((l) => l.map(cell).join(";")).join("\n");
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
        const qs = quizFor(session, act.quiz)?.questions || [];
        const rows = await Promise.all(qs.map((q) => api.results(sid, `${act.id}#${q.id}`)));
        if (!rows.some((r) => r.length)) continue;
        blocks.push(`<div class="res-block"><b>${T(act.titre)}</b>${qs.map((q, qi) => { const n = countOf(rows[qi]), good = rows[qi].filter((r) => r.value === q.ok).reduce((a, r) => a + r.n, 0); return `<div class="small prow"><span>${qi + 1}. ${T(q.q)}</span><b>${n ? Math.round((good / n) * 100) + NB + "%" : "—"}</b></div>`; }).join("")}<div class="small muted">Taux de bonnes réponses par question</div></div>`);
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
