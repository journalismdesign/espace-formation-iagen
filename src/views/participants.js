/* Participants et formateurs (onglet principal du back-office) :
   - « Émargements » (#/admin/participants, #/admin/participants/emargements/<session>) : feuille par demi-journée de
     chaque session. Une case se remplit quand le ou la stagiaire touche « J'ai émargé » pendant le créneau (déclaré) ;
     l'équipe la corrige d'un clic : présent·e, absent·e, puis retour à la déclaration. Tableur à télécharger.
     Formateur·ices : leurs sessions ; administration : toutes (hors démos des invité·es).
   - « Stagiaires » (#/admin/participants/stagiaires, administration) : toutes les adresses collectées, une ligne par
     personne avec ses sessions, recherche, copie des adresses et tableur.
   « Comptes et accès » et « Fiches intervenant·es » restent dans staff.js (#/admin/equipe…), sous le même en-tête.
   Données : migration …_numeros_emargements.sql (session_presence, set_presence, list_trainees). */
import { $, $$, T, esc, guard, toast, download, copyText, debounce } from "../lib/dom.js";
import { participantsHead } from "../lib/adminNav.js";
import { isAdmin, isGuest } from "../lib/roles.js";
import { sessionNo, halfDays, stateOf, nextValue, stateText, totals, presenceCsv, groupTrainees, traineesCsv } from "../lib/presence.js";
import { datesFr } from "../lib/brand.js";
import { isArchived, sessionEnded, trainingDates, parisToday } from "../lib/archive.js";
import { pop } from "../lib/motion.js";

const MIG = "Pas encore activé : la migration 20261130000000_numeros_emargements.sql doit être exécutée dans Supabase.";
const missing = (e) => /schema cache|does not exist|Could not find the function|not find the function/i.test(e?.message || "");
const slug = (x) => String(x || "session").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function viewParticipants(root, [tab = "emargements", sid], ctx) {
  const { me, go } = ctx;
  if (isGuest(me)) { go("#/admin"); return; }
  const admin = isAdmin(me);
  if (tab === "stagiaires" && !admin) tab = "emargements";
  root.innerHTML = `${participantsHead(tab, { admin })}<section id="paBody"><p class="muted">Chargement…</p></section>`;
  const box = $("#paBody", root);
  return tab === "stagiaires" ? viewTrainees(box, ctx) : viewSheets(box, sid, ctx);
}

/* ---------- Émargements ---------- */
// Ordre : en cours, puis terminées récemment, puis à venir, puis archivées
function ordered(list) {
  const today = parisToday();
  const group = (s) => {
    const ds = trainingDates(s);
    if (isArchived(s)) return 3;
    if (sessionEnded(s)) return 1;
    return ds.length && ds[0] <= today && today <= ds.at(-1) ? 0 : 2;
  };
  const d = (s) => String(s.date || "");
  return [...list].sort((a, b) => group(a) - group(b) || (group(a) === 2 ? d(a).localeCompare(d(b)) : d(b).localeCompare(d(a))));
}
const GROUP_LABEL = ["En cours", "Terminées", "À venir", "Archivées"];

async function viewSheets(box, sid, { api, go }) {
  const sessions = ordered((await api.listSessions()).filter((s) => !s.demo_owner));
  if (!sessions.length) { box.innerHTML = `<p class="empty">${T("Aucune session pour l'instant.")}</p>`; return; }
  const cur = sessions.find((s) => s.id === sid) || sessions[0];
  const today = parisToday();
  const groupOf = (s) => (isArchived(s) ? 3 : sessionEnded(s) ? 1 : trainingDates(s).some((x) => x === today) ? 0 : 2);
  let lastG = -1;
  box.innerHTML = `
    <div class="pa-layout">
      <aside class="pa-list card" aria-label="Sessions">
        <label class="f" for="paSel">Session</label>
        <select id="paSel" class="pa-select">${sessions.map((s) => `<option value="${s.id}"${s.id === cur.id ? " selected" : ""}>${esc(sessionNo(s) ? sessionNo(s) + " · " : "")}${esc(s.title)}</option>`).join("")}</select>
        <div class="pa-items">${sessions.map((s) => {
          const g = groupOf(s), head = g !== lastG ? `<div class="flist-g">${GROUP_LABEL[g]}</div>` : ""; lastG = g;
          return `${head}<a class="pa-item${s.id === cur.id ? " on" : ""}" href="#/admin/participants/emargements/${s.id}"${s.id === cur.id ? ' aria-current="page"' : ""}>
            <span class="mono small">${esc(sessionNo(s) || "—")}</span><b>${T(s.title)}</b><span class="small muted">${T(datesFr(s) || "Sans date")}${s.client ? ` · ${T(s.client)}` : ""}</span></a>`;
        }).join("")}</div>
      </aside>
      <section class="pa-sheet card" id="paSheet"><p class="muted">Chargement…</p></section>
    </div>`;
  $("#paSel", box).onchange = (e) => go(`#/admin/participants/emargements/${e.target.value}`);

  const sheet = $("#paSheet", box);
  let roster = [], pres = new Map(), migOk = true;
  const load = async () => {
    const [r, p] = await Promise.all([api.roster(cur.id), api.presence(cur.id).catch((e) => { if (missing(e)) { migOk = false; return []; } throw e; })]);
    roster = r; pres = new Map(p.map((x) => [x.user_id, x.presence || {}]));
  };
  const slots = halfDays(cur);
  const rowsOf = () => roster.map((r) => ({ ...r, presence: pres.get(r.user_id) || {} }));
  const cellHtml = (r, s) => {
    const p = r.presence[s.key], st = stateOf(p);
    const icon = { present: "✓", absent: "✕", self: "✍", none: "" }[st];
    const tip = (stateText(p) || "rien d'enregistré") + (migOk ? " · cliquer pour corriger" : "");
    return `<button type="button" class="pres ${st}" data-u="${r.user_id}" data-k="${s.key}" title="${esc(tip)}" aria-label="${esc(`${r.full_name || r.email}, ${s.label} : ${tip}`)}"${migOk ? "" : " disabled"}>${icon}</button>`;
  };
  const totalsHtml = () => totals(slots, rowsOf()).map((n) => `<td class="pres-total">${n}<span class="muted">/${roster.length}</span></td>`).join("");
  const draw = () => {
    const rows = rowsOf();
    sheet.innerHTML = `
      <div class="pa-head"><div><div class="kicker-d">${esc(sessionNo(cur) ? "Session " + sessionNo(cur) : "Session")}</div><h2 style="margin:2px 0">${T(cur.title)}</h2>
        <p class="muted small" style="margin:0">${T(datesFr(cur) || "Sans date")}${cur.client ? ` · ${T(cur.client)}` : ""} · ${roster.length} participant·e${roster.length > 1 ? "s" : ""}</p></div>
        <div class="head-actions"><a class="btn ghost sm" href="#/admin/s/${cur.id}/avant">Ouvrir la session</a><button class="btn sm" id="paCsv"${roster.length ? "" : " disabled"}>Télécharger (CSV)</button></div></div>
      ${migOk ? "" : `<div class="warn small">${T(MIG)} ${T("En attendant, seule la case « Présent·e » de l'onglet Avant de la session est enregistrée.")}</div>`}
      ${!slots.length ? `<p class="empty">${T("Aucun créneau d'émargement dans le déroulé de cette session.")}</p>`
      : !roster.length ? `<p class="empty">${T("Personne n'a encore rejoint la session : la feuille se remplira à mesure que les stagiaires entrent et émargent.")}</p>`
      : `<div class="table-scroll"><table class="tbl pres-tbl"><thead><tr><th>Participant·e</th>${slots.map((s) => `<th class="pres-h"><b>J${s.day}</b><span>${s.half === "matin" ? "matin" : "après-midi"}</span>${s.date ? `<span class="muted">${esc(new Date(s.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}</span>` : ""}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr><td><b>${T(r.full_name || "—")}</b><div class="small muted">${esc(r.email || "")}</div></td>${slots.map((s) => `<td class="pres-c">${cellHtml(r, s)}</td>`).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr><td class="small muted">Présent·es</td>${totalsHtml()}</tr></tfoot></table></div>`}
      <p class="small muted pres-legend"><span class="pres present">✓</span> présent·e (validé par l'équipe) <span class="pres self">✍</span> émargé par le ou la stagiaire <span class="pres absent">✕</span> absent·e <span class="pres none"></span> rien d'enregistré.
        ${T("Un clic sur une case : présent·e, puis absent·e, puis retour à ce que la personne a déclaré. La signature officielle reste celle des feuilles de l'organisme et du client.")}</p>`;
    $("#paCsv", sheet)?.addEventListener("click", () => download(`emargement-${sessionNo(cur) || slug(cur.title)}-${slug(cur.title)}.csv`, presenceCsv(cur, rowsOf())));
    $$("button.pres[data-u]", sheet).forEach((b) => (b.onclick = async () => {
      const r = rowsOf().find((x) => x.user_id === b.dataset.u); if (!r) return;
      const next = nextValue(stateOf(r.presence[b.dataset.k]));
      b.disabled = true;
      const out = await guard(() => api.setPresence(cur.id, b.dataset.u, b.dataset.k, next));
      if (out) {
        pres.set(b.dataset.u, out);
        draw(); // case, totaux et écouteurs
        pop($(`button.pres[data-u="${b.dataset.u}"][data-k="${b.dataset.k}"]`, sheet));
      } else b.disabled = false;
    }));
  };
  try { await load(); draw(); } catch (e) { sheet.innerHTML = `<div class="warn">${T(e.message)}</div>`; return; }
  // Les stagiaires émargent pendant le créneau : la feuille se met à jour toute seule
  const refresh = debounce(async () => { try { await load(); draw(); } catch {} }, 600);
  const off = api.watch ? api.watch(cur.id, refresh, ["session_members"]) : null;
  return () => { try { off?.(); } catch {} };
}

/* ---------- Adresses des stagiaires ---------- */
async function viewTrainees(box, { api }) {
  const [rows, sessions] = await Promise.all([api.listTrainees().catch((e) => (missing(e) ? null : Promise.reject(e))), api.listSessions()]);
  if (!rows) { box.innerHTML = `<div class="warn">${T(MIG)}</div>`; return; }
  const all = groupTrainees(rows, sessions.filter((s) => !s.demo_owner));
  let q = "";
  box.innerHTML = `
    <div class="eq-head"><p class="muted" style="margin:0;max-width:760px">${T("Toutes les adresses collectées : les stagiaires entré·es dans une session, et les personnes invitées qui ne l'ont pas encore rejointe. Ces données personnelles servent au suivi des formations.")}</p></div>
    <div class="card table-card">
      <div class="pa-tools"><input type="search" id="trQ" placeholder="Rechercher un nom, une adresse, une session…" aria-label="Rechercher">
        <span class="small muted" id="trN"></span>
        <button class="btn ghost sm" id="trCopy">Copier les adresses</button><button class="btn sm" id="trCsv">Télécharger (CSV)</button></div>
      <div id="trList"></div>
    </div>`;
  const filtered = () => !q ? all : all.filter((e) => [e.full_name, e.email, e.metier, ...e.sessions.flatMap((s) => [s.no, s.title])].join(" ").toLowerCase().includes(q));
  const draw = () => {
    const list = filtered();
    $("#trN", box).textContent = `${list.length} adresse${list.length > 1 ? "s" : ""}${q ? ` sur ${all.length}` : ""} · ${list.filter((e) => e.joined).length} inscrit·e${list.filter((e) => e.joined).length > 1 ? "s" : ""}`;
    $("#trList", box).innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Nom</th><th>E-mail</th><th>Métier</th><th>Sessions</th><th>Statut</th></tr></thead><tbody>
      ${list.map((e) => `<tr><td><b>${T(e.full_name || "—")}</b></td><td class="small">${esc(e.email)}</td><td class="small">${T(e.metier || "")}</td>
        <td><div class="chips">${e.sessions.map((s) => `<a class="chip small" href="#/admin/s/${s.id}/avant" title="${esc(s.title)}">${esc(s.no || "—")} · ${T(s.title.length > 34 ? s.title.slice(0, 33) + "…" : s.title)}</a>`).join("")}</div></td>
        <td>${e.joined ? `<span class="pill ok">inscrit·e</span>` : `<span class="pill">invité·e</span>`}</td></tr>`).join("")}</tbody></table>`
      : `<p class="empty">${T(all.length ? "Aucune adresse ne correspond." : "Aucune adresse pour l'instant : elles apparaissent quand les stagiaires rejoignent une session.")}</p>`;
  };
  draw();
  $("#trQ", box).oninput = debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 150);
  $("#trCopy", box).onclick = (e) => { const list = filtered(); if (!list.length) return toast("Aucune adresse à copier.", "ko"); copyText(list.map((x) => x.email).join(", "), e.currentTarget); };
  $("#trCsv", box).onclick = () => download(`stagiaires-${parisToday()}.csv`, traineesCsv(filtered()));
}
