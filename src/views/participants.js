/* Participants et formateurs (onglet principal du back-office, administration) : « Stagiaires »
   (#/admin/participants), toutes les adresses collectées, une ligne par personne avec ses sessions, recherche, copie
   des adresses et tableur. « Comptes et accès » et « Fiches intervenant·es » restent dans staff.js (#/admin/equipe…),
   sous le même en-tête. Données : list_trainees (migration …_numeros_emargements.sql).
   L'émargement par demi-journée, essayé le 28 novembre 2026, a été retiré du site (fonctions de la base inutilisées). */
import { $, T, esc, toast, download, copyText, debounce } from "../lib/dom.js";
import { participantsHead } from "../lib/adminNav.js";
import { groupTrainees, traineesCsv } from "../lib/stagiaires.js";
import { parisToday } from "../lib/archive.js";

const MIG = "Pas encore activé : la migration 20261130000000_numeros_emargements.sql doit être exécutée dans Supabase.";
const missing = (e) => /schema cache|does not exist|Could not find the function|not find the function/i.test(e?.message || "");

export async function viewParticipants(root, _params, { api }) {
  root.innerHTML = `${participantsHead("stagiaires")}<section id="paBody"><p class="muted">Chargement…</p></section>`;
  const box = $("#paBody", root);
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
    const list = filtered(), joined = list.filter((e) => e.joined).length;
    $("#trN", box).textContent = `${list.length} adresse${list.length > 1 ? "s" : ""}${q ? ` sur ${all.length}` : ""} · ${joined} inscrit·e${joined > 1 ? "s" : ""}`;
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
