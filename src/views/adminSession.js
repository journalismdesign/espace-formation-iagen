/* Back-office d'une session, en trois temps :
   Avant (accès, invitations, cadrages), Jour J (animation en direct),
   Après (projets, émargement, bilan, duplication, résultats, ressources). */
import { $, $$, T, esc, NB, guard, toast, debounce, dateFr, download, copyText } from "../lib/dom.js";
import { QUIZ } from "../data.js";
import { ACT_TYPES, currentAct, respKey, renderResults, defaultActivities, countOf } from "../lib/activities.js";
import { screenHtml } from "../lib/screen.js";
import { openSheet } from "../lib/content.js";
import { joinUrl, qr, showQr, parseEmails } from "./admin.js";
import { STATUS } from "./home.js";
import { STEPS, SENSIB } from "./cadrageModel.js";

const PHASES = [["avant", "Avant — inscription et cadrage"], ["jour", "Jour J — animation"], ["apres", "Après — suivi"]];
const firstName = (r) => (r.full_name || r.email.split("@")[0]).split(" ")[0];

// Données de l'écran projeté (réponses agrégées, participants, projets)
export async function loadScreenData(api, session) {
  const act = currentAct(session);
  const [rows, roster, projects] = await Promise.all([
    act && session.status === "live" ? api.results(session.id, respKey(act, session.live)) : [],
    api.roster(session.id).catch(() => []),
    act?.type === "projects" ? api.listProjects(session.id) : [],
  ]);
  const byUser = Object.fromEntries(roster.map((r) => [r.user_id, r]));
  return {
    rows, participants: roster.length,
    projects: projects.filter((p) => p.status === "validated").map((p) => ({ titre: p.data?.retenu?.titre || "Sans titre", description: p.data?.retenu?.description, auteur: byUser[p.user_id] ? firstName(byUser[p.user_id]) : "" })),
  };
}

export async function viewAdminSession(root, [sid, phase = "avant"], ctx) {
  const { api, go } = ctx;
  let session = await api.getSession(sid);
  if (!session) { root.innerHTML = `<div class="card"><h2>Session introuvable</h2><a class="btn" href="#/admin">Retour</a></div>`; return; }
  if (!PHASES.some(([k]) => k === phase)) phase = "avant";
  const qrUrl = await qr(joinUrl(session.code), 480);

  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div>
      <h1 style="margin:0">${T(session.title)}</h1>
      <p class="muted" style="margin:4px 0">${T(session.formation)} · ${T(dateFr(session.date))} · code <b class="mono">${esc(session.code)}</b></p>
      <div class="chips"><span class="state ${session.status}" id="stateP">${STATUS[session.status]}</span><span class="pill" id="rtP"><span class="dot on"></span>Temps réel</span></div>
    </div>
    <div class="head-actions"><a class="btn ghost sm" href="#/s/${sid}" title="Voir l'espace tel que le voient les stagiaires">Voir côté stagiaire</a>
      ${session.status === "draft" ? `<button class="btn sm" data-status="live">Ouvrir la salle</button>` : session.status === "live" ? `<button class="btn sm ghost" data-status="draft">Fermer la salle</button>` : `<button class="btn sm ghost" data-status="live">Rouvrir</button>`}</div></div>
    <div class="phases">${PHASES.map(([k, l]) => `<a href="#/admin/s/${sid}/${k}"${k === phase ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</div>
    <div id="phase"></div>`;
  $$("[data-status]", root).forEach((b) => (b.onclick = async () => {
    const st = b.dataset.status;
    await guard(() => api.updateSession(sid, { status: st, ...(st !== "live" ? { live: {} } : {}) }), st === "live" ? "Salle ouverte : les stagiaires peuvent répondre." : "Salle fermée.");
    go(location.hash);
  }));

  const box = $("#phase", root);
  const cleanups = [];
  if (phase === "avant") await phaseAvant();
  else if (phase === "jour") await phaseJour();
  else await phaseApres();
  return () => cleanups.forEach((f) => f());

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
            <p class="small muted" style="margin-top:0">${roster.filter((r) => r.project_status === "validated").length} cadrage(s) validé(s) · ${roster.filter((r) => r.project_id && r.project_status !== "validated").length} en cours</p>
            ${roster.length ? `<table class="tbl"><thead><tr><th>Nom</th><th>Profil</th><th>Cadrage</th><th></th></tr></thead><tbody>${roster.map((r) => `<tr>
              <td><b>${T(r.full_name || "—")}</b><div class="small muted">${esc(r.email)}</div></td>
              <td class="small">${T(r.metier || "—")}<div class="muted">${T(r.niveau || "")}</div></td>
              <td>${r.project_status === "validated" ? `<span class="tag ok">✓ Validé</span>` : r.project_id ? `<span class="tag">${r.project_steps}/${STEPS.length} · commencé</span>` : `<span class="small muted">Pas commencé</span>`}${r.project_title ? `<div class="small">${T(r.project_title)}</div>` : ""}</td>
              <td class="actions">${r.project_id ? `<button class="btn sm ghost" data-proj="${r.project_id}">Voir et commenter</button>` : ""}<button class="iconbtn danger" data-rm="${r.user_id}" title="Retirer de la session" aria-label="Retirer">✕</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">Personne n'a encore rejoint la session.</p>`}
          </div>
          <div class="card" style="margin-top:14px">
            <h3>Invitations par e-mail</h3>
            <p class="small muted" style="margin-top:0">${T("La personne invitée retrouve la session dès sa première connexion avec cette adresse. Aucun e-mail n'est envoyé par la plateforme : transmettez le lien de connexion vous-même.")}</p>
            <form id="invF"><textarea id="invT" placeholder="Une adresse par ligne"></textarea><button class="btn sm" type="submit" style="margin-top:8px">Ajouter</button></form>
            <div class="chips" style="margin-top:10px">${invites.map((i) => `<span class="chip">${esc(i.email)} ${joined.has(i.email) ? "✓" : ""}<button class="linkbtn" data-uninv="${esc(i.email)}" aria-label="Retirer l'invitation">✕</button></span>`).join("") || `<span class="small muted">Aucune invitation.</span>`}</div>
          </div>
        </div>
        <div>
          <div class="card qrcard"><img src="${qrUrl}" alt="QR code de la session"><div class="small" style="margin:6px 0">Lien à transmettre :</div><div class="mono small linkbox" id="jl">${esc(joinUrl(session.code))}</div>
            <div class="chips" style="justify-content:center;margin-top:8px"><button class="btn sm ghost" id="cpL">Copier le lien</button><button class="btn sm ghost" id="pjQ">Projeter le QR code</button></div></div>
          <form class="card" id="infoF" style="margin-top:14px"><h3>Informations</h3>
            <label class="f">Intitulé</label><input type="text" id="iT" value="${esc(session.title)}" required>
            <label class="f">Client ou rédaction</label><input type="text" id="iC" value="${esc(session.client || "")}">
            <label class="f">Date</label><input type="date" id="iD" value="${esc(session.date || "")}">
            <label class="f">Format</label><select id="iF"><option value="1"${session.format === "1" ? " selected" : ""}>Une journée</option><option value="2"${session.format === "2" ? " selected" : ""}>Deux journées</option></select>
            <button class="btn sm" type="submit" style="margin-top:10px">Enregistrer</button></form>
        </div>
      </div>`;
      $("#invF", box).onsubmit = async (e) => { e.preventDefault(); const em = parseEmails($("#invT", box).value); if (!em.length) return toast("Aucune adresse valide.", "ko"); await guard(() => api.addInvites(sid, em), `${em.length} invitation(s) ajoutée(s).`); draw(); };
      $$("[data-uninv]", box).forEach((b) => (b.onclick = async () => { await guard(() => api.removeInvite(sid, b.dataset.uninv)); draw(); }));
      $$("[data-rm]", box).forEach((b) => (b.onclick = async () => { if (confirm("Retirer cette personne de la session ? Son cadrage reste enregistré.")) { await guard(() => api.removeMember(sid, b.dataset.rm)); draw(); } }));
      $$("[data-proj]", box).forEach((b) => (b.onclick = () => openProject(b.dataset.proj, roster, draw)));
      $("#cpL", box).onclick = (e) => copyText(joinUrl(session.code), e.target);
      $("#pjQ", box).onclick = async () => showQr(session, await qr(joinUrl(session.code), 900));
      $("#infoF", box).onsubmit = async (e) => {
        e.preventDefault();
        const format = $("#iF", box).value;
        const patch = { title: $("#iT", box).value.trim(), client: $("#iC", box).value.trim(), date: $("#iD", box).value || null, format };
        if (format !== session.format && confirm("Adapter la séquence d'activités du jour J au nouveau format ?")) patch.activities = defaultActivities(format);
        session = await guard(() => api.updateSession(sid, patch), "Informations enregistrées.") || session;
      };
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
      ${a.v1 ? `<div class="sec"><h4>Analyse ${a.v2 ? "V2" : "V1"}</h4><div class="analysis small">${T(a.v2 || a.v1)}</div></div>` : ""}
      ${p.question ? `<div class="sec disc"><h4>Question au formateur</h4><p style="margin:0">${T(p.question)}</p></div>` : ""}
      <div class="sec"><h4>Votre retour</h4><textarea id="fbT" maxlength="4000" style="min-height:110px">${esc(p.trainer_comment || "")}</textarea><button class="btn sm" id="fbS" style="margin-top:8px">Envoyer le retour</button></div>`);
    $("#fbS").onclick = async () => { await guard(() => api.commentProject(pid, $("#fbT").value.trim()), "Retour enregistré : la personne le verra en haut de son cadrage."); after?.(); };
  }

  /* =================================================================
     JOUR J
     ================================================================= */
  async function phaseJour() {
    box.innerHTML = `
      <div class="grid adm2">
        <div class="card">
          <h3>Activités</h3>
          <p class="small muted" id="hint" style="margin-top:0"></p>
          <div class="acts" id="acts"></div>
          <div id="ctrl" style="margin:12px 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><div class="kicker-d">Écran projeté</div><button class="linkbtn small" id="openScr">▭ Ouvrir l'écran projeté</button></div>
          <div id="preview" class="preview"></div>
          <details style="margin-top:14px"><summary class="small" style="cursor:pointer">Ajouter ou retirer des activités</summary><div id="actEdit"></div></details>
          <hr><label class="f inline"><input type="checkbox" id="closeDay"${session.status === "closed" ? " checked" : ""}> Clore la journée (les stagiaires gardent l'accès aux ressources)</label>
        </div>
        <div>
          <div class="card qrcard"><img src="${qrUrl}" alt="QR code"><button class="btn sm ghost" id="pjQ" style="margin-top:8px">Projeter le QR code</button></div>
          <div class="card" style="margin-top:14px"><h3 id="pTitle">Participant·es</h3><div id="plist"></div></div>
        </div>
      </div>`;
    $("#openScr", box).onclick = () => window.open(`#/ecran/${sid}`, "ecran-" + sid, "popup=yes,width=1280,height=760");
    $("#pjQ", box).onclick = async () => showQr(session, await qr(joinUrl(session.code), 900));
    $("#closeDay", box).onchange = async (e) => { session = await guard(() => api.updateSession(sid, e.target.checked ? { status: "closed", live: {} } : { status: "live" }), e.target.checked ? "Journée close." : "Session rouverte.") || session; draw(); };

    const setLive = async (live, extra = {}) => {
      if (session.status !== "live") { if (!confirm("La salle est fermée. L'ouvrir et lancer l'activité ?")) return; }
      session = await guard(() => api.updateSession(sid, { status: "live", live, ...extra })) || session;
      draw();
    };
    const launch = async (act) => {
      const live = { act: act.id, qi: 0, reveal: false, started_at: new Date().toISOString() };
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
      $("#hint", box).textContent = session.status === "live" ? "La salle est ouverte. Cliquez sur une activité pour la lancer chez les participant·es et sur l'écran projeté." : "La salle est fermée : lancer une activité l'ouvrira.";
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
      $("[data-stop]", box)?.addEventListener("click", () => setLive({}));
      const sd = await loadScreenData(api, session);
      $("#preview", box).innerHTML = screenHtml({ ...sd, session, qrUrl }, true);
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
      <div class="card"><p style="margin:0 0 10px">${roster.length} participant·es · ${validated.length} cadrage(s) validé(s) · ${roster.filter((r) => r.attended).length} présent·es émargé·es. ${T("Les projets, retours et résultats restent consultables après la session.")}</p>
        <div class="chips"><a class="btn sm" href="#projets">Voir les projets</a><a class="btn sm ghost" href="#emarg">Émargement, bilan et duplication</a><a class="btn sm ghost" href="#resultats">Résultats à l'écran</a></div></div>

      <div class="card" id="projets" style="margin-top:14px"><h3>Projets (${projects.length})</h3>
        ${projects.length ? `<div class="grid g2">${projects.map((p) => `<div class="proj-card"><span class="tag${p.status === "validated" ? " ok" : ""}">${p.status === "validated" ? "✓ Validé" : "En cours"}</span><b>${T(p.data?.retenu?.titre || "Sans titre")}</b><div class="small muted">${T(by[p.user_id]?.full_name || by[p.user_id]?.email || "")}</div><p class="small">${T((p.data?.retenu?.description || "").slice(0, 260))}</p>${p.trainer_comment ? `<p class="small"><b>Votre retour :</b> ${T(p.trainer_comment)}</p>` : ""}</div>`).join("")}</div>` : `<p class="empty">Aucun cadrage.</p>`}</div>

      <div class="card" id="emarg" style="margin-top:14px"><h3>Émargement</h3>
        ${roster.length ? `<table class="tbl"><thead><tr><th>Présent·e</th><th>Nom</th><th>E-mail</th><th>Cadrage</th></tr></thead><tbody>${roster.map((r) => `<tr><td><input type="checkbox" data-att="${r.user_id}"${r.attended ? " checked" : ""} aria-label="Présence de ${esc(r.full_name || r.email)}"></td><td>${T(r.full_name || "—")}</td><td class="small">${esc(r.email)}</td><td class="small">${r.project_status === "validated" ? "Validé" : r.project_id ? `${r.project_steps}/${STEPS.length}` : "—"}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Aucun participant.</p>`}
        <div class="chips" style="margin-top:12px"><button class="btn sm" id="csv">Exporter le bilan (CSV)</button><button class="btn sm ghost" id="dup">Dupliquer la session</button></div>
        <p class="small muted">${T("Le bilan reprend présence, profil, état du cadrage, progression dans le déroulé et scores aux quiz. La duplication reprend la séquence, les ressources et les intitulés des accès (sans les valeurs), sans participant·es.")}</p></div>

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
    $("#dup", box).onclick = async () => { const id = await guard(() => api.duplicateSession(sid), "Session dupliquée."); if (id) go(`#/admin/s/${id}`); };
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
