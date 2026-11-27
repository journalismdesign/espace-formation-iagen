/* Back-office : liste des sessions, création, QR code, suppression. */
import QRCode from "qrcode";
import { $, $$, T, esc, guard, dateFr } from "../lib/dom.js";
import { defaultActivities } from "../lib/activities.js";
import { quizKeysOf, snapshotQuizzes } from "../lib/quizzes.js";
import { modulesFor } from "../lib/content.js";
import { STATUS } from "./home.js";
import { skinDark } from "../lib/skin.js";
import { isAdmin, isGuest } from "../lib/roles.js";
import { isArchived, archiveDate, sessionEnded, trainingDates, parisToday } from "../lib/archive.js";

// Lien court de la session : <site>/CODE (redirigé vers #/join/CODE par 404.html ou au démarrage).
// VITE_SHORT_BASE permet un domaine plus court (ex. https://formation.samsa.fr/).
const SHORT_BASE = import.meta.env.VITE_SHORT_BASE;
export const joinUrl = (code) => (SHORT_BASE ? SHORT_BASE.replace(/\/?$/, "/") : location.origin + location.pathname.replace(/[^/]*$/, "")) + code;
export const joinUrlLabel = (code) => joinUrl(code).replace(/^https?:\/\//, "");
export const qr = (text, size = 320) => QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: skinDark(), light: "#ffffff" } });

export async function viewAdmin(root, [view], { api, go, me }) {
  const admin = isAdmin(me), guest = isGuest(me);
  const archivedTab = view === "archives";
  const [all, counts, brands, trainers, skins] = await Promise.all([api.listSessions(), api.memberCounts(), api.listBrands().catch(() => []),
    api.listTrainers().catch(() => []), api.listSkins().catch(() => [])]);
  /* Deux onglets : à venir (en cours, à venir, terminées depuis moins de 5 jours) et archivées (5 jours après le
     dernier jour, src/lib/archive.js). Les archives, de la plus récente à la plus ancienne. */
  const archived = all.filter((s) => isArchived(s)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  /* À venir : d'abord les sessions en cours (aujourd'hui entre leur premier et leur dernier jour), puis celles à venir
     (par date, sans date à la fin), puis les terminées en attente d'archivage (grisées, la plus récente d'abord). */
  const today = parisToday();
  const current = (s) => { const ds = trainingDates(s); return !sessionEnded(s) && ds.length > 0 && ds[0] <= today && today <= ds.at(-1); };
  const group = (s) => (sessionEnded(s) ? 2 : current(s) ? 0 : 1);
  const byDate = (a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"));
  const sessions = archivedTab ? archived : all.filter((s) => !isArchived(s))
    .sort((a, b) => group(a) - group(b) || (group(a) === 2 ? byDate(b, a) : byDate(a, b)));
  const shortFr = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(/^1 /, "1er ");
  const stateHtml = (s) => isArchived(s) ? `<span class="state archived">Archivée</span>`
    : sessionEnded(s) ? `<span class="state closed">Terminée</span>${archiveDate(s) ? ` <span class="small muted">${T(`· archivage le ${shortFr(archiveDate(s))}`)}</span>` : ""}`
    : current(s) ? `<span class="state current">${s.status === "live" ? `<span class="dot on"></span> ` : ""}En cours</span>`
    : `<span class="state ${s.status}">${STATUS[s.status]}</span>`;
  const trainerName = (id) => trainers.find((t) => t.id === id)?.name || "";
  const trOptions = (sel) => `<option value="">— Non attribuée —</option>${trainers.map((t) => `<option value="${t.id}"${t.id === sel ? " selected" : ""}>${T(t.name)}${t.login_email ? "" : " (sans compte)"}</option>`).join("")}`;
  // Client : entreprise préenregistrée (brands) ou nom saisi avec « Autre »
  const clientOf = (s) => {
    const b = s.brand_id && brands.find((x) => x.id === s.brand_id);
    return b ? { name: b.name, logo: b.logo || b.logo_light || null } : { name: s.client || "", logo: s.client_logo || null };
  };
  root.innerHTML = `
    <div class="pagehead"><div><div class="kicker-d">${admin ? "Back-office · administration" : guest ? "Back-office · invitation" : "Back-office formateur"}</div><h1>${admin || guest ? "Sessions" : "Mes sessions"}</h1>
      ${admin ? "" : `<p class="muted">${T(guest ? "Toutes les sessions, en lecture seule : ouvrez-en une pour voir ses réglages, son pilotage, son suivi et le côté stagiaire." : "Les sessions qui vous sont attribuées par l'administration. Pour en obtenir une autre, contactez-la.")}</p>`}</div>
      ${admin ? `<div class="head-actions"><a class="btn ghost" href="#/admin/quiz">Quiz et sondages</a><a class="btn ghost" href="#/admin/equipe">Équipe et accès</a><a class="btn ghost" href="#/admin/reglages">Réglages généraux</a><button class="btn" id="newBtn">+ Démarrer une session</button></div>` : ""}</div>
    <form class="card" id="newForm" hidden style="margin-bottom:14px">
      <h3>Nouvelle session</h3>
      <div class="grid g2">
        <div><label class="f" for="nTitle">Intitulé</label><input type="text" id="nTitle" required maxlength="140" placeholder="Libération · Prendre en main les IA génératives"></div>
        <div><label class="f" for="nClient">Client ou rédaction</label><input type="text" id="nClient" maxlength="80" placeholder="Libération"></div>
        <div><label class="f" for="nDate">Date (jour 1 · le jour 2 se règle ensuite)</label><input type="date" id="nDate"></div>
        <div><label class="f" for="nFmt">Format</label><select id="nFmt"><option value="1">Une journée</option><option value="2">Deux journées</option></select></div>
        <div><label class="f" for="nTr">Intervenant·e (attribution)</label><select id="nTr">${trOptions(null)}</select></div>
        <div><label class="f" for="nSk">Habillage (environnement du centre)</label><select id="nSk"><option value="">Par défaut</option>${skins.map((k) => `<option value="${k.id}">${T(k.name)}</option>`).join("")}</select></div>
      </div>
      <label class="f" for="nInv">Inviter des stagiaires (une adresse par ligne, facultatif)</label>
      <textarea id="nInv" placeholder="prenom.nom@liberation.fr"></textarea>
      <p class="small muted">${T("Facultatif : les stagiaires entrent surtout par le lien ou le QR code de la session, avec leur prénom, leur e-mail et un code personnel reçu par e-mail.")}</p>
      <div style="display:flex;gap:8px"><button class="btn" type="submit">Créer la session</button><button class="btn ghost" type="button" id="nCancel">Annuler</button></div>
    </form>
    <div class="phases" style="margin-bottom:12px"><a href="#/admin"${archivedTab ? "" : ' aria-current="page"'}>Sessions à venir</a><a href="#/admin/archives"${archivedTab ? ' aria-current="page"' : ""}>Sessions archivées${archived.length ? ` <span class="small muted">${archived.length}</span>` : ""}</a></div>
    <div class="card table-card">
      ${sessions.length ? `<table class="tbl"><thead><tr><th>Session</th><th>Client</th><th>Intervenant·e</th><th>État</th><th>Date</th><th>Code</th><th>Participants</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr${!archivedTab && sessionEnded(s) ? ' class="row-ended"' : ""}>
        <td><a href="#/admin/s/${s.id}"><b>${T(s.title)}</b></a><div class="small muted">${T(s.formation || "")}${s.format === "2" ? " · 2 jours" : " · 1 jour"}</div></td>
        <td class="client-cell">${(() => { const c = clientOf(s); return c.logo ? `<img src="${esc(c.logo)}" alt="${esc(c.name)}" title="${esc(c.name)}" class="client-logo">` : c.name ? `<span>${T(c.name)}</span>` : `<span class="muted">—</span>`; })()}</td>
        <td class="small">${admin ? `<select class="assign" data-assign="${s.id}" aria-label="Intervenant·e de la session">${trOptions(s.trainer_id)}</select>` : T(trainerName(s.trainer_id) || "—")}</td>
        <td class="state-cell">${stateHtml(s)}</td>
        <td class="small mono date-cell">${s.date || "—"}</td>
        <td class="mono">${esc(s.code)}</td>
        <td>${counts[s.id] || 0}</td>
        <td class="actions"><button class="iconbtn" data-qr="${s.id}" title="QR code" aria-label="QR code">▦</button>${admin ? `<button class="iconbtn" data-dup="${s.id}" title="Dupliquer" aria-label="Dupliquer la session">⧉</button><button class="iconbtn danger" data-del="${s.id}" title="Supprimer" aria-label="Supprimer">✕</button>` : ""}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="empty">${archivedTab ? T("Aucune session archivée. Une session passe ici 5 jours après son dernier jour.") : admin ? "Aucune session. Créez la première." : T("Aucune session ne vous est attribuée pour l'instant.")}</p>`}
    </div>`;

  const form = $("#newForm", root);
  // Attribution d'une session (admin) : la fiche intervenant·e choisie donne accès au compte qui porte son adresse
  $$("[data-assign]", root).forEach((sel) => (sel.onchange = () => guard(() => api.updateSession(sel.dataset.assign, { trainer_id: sel.value || null }), "Attribution enregistrée.")));
  if (!admin) { form.remove(); } else
  $("#newBtn", root).onclick = () => { form.hidden = false; $("#nTitle", root).focus(); };
  if (admin) $("#nCancel", root).onclick = () => (form.hidden = true);
  if (admin) form.onsubmit = async (e) => {
    e.preventDefault();
    const format = $("#nFmt", root).value;
    // Activités par défaut et copie des quiz de la bibliothèque (sans la migration : data.js, sans copie)
    const bank = await api.listBank().catch(() => ({ ready: false, items: [] }));
    const activities = defaultActivities(format, bank.items);
    const s = await guard(() => api.createSession({
      title: $("#nTitle", root).value.trim(), client: $("#nClient", root).value.trim(),
      date: $("#nDate", root).value || null, format, activities,
      ...(bank.ready ? { quizzes: snapshotQuizzes({}, quizKeysOf(activities, modulesFor(format)), bank.items) } : {}),
      trainer_id: $("#nTr", root).value || null, skin_id: $("#nSk", root).value || null,
    }), "Session créée.");
    if (!s) return;
    const emails = parseEmails($("#nInv", root).value);
    if (emails.length) await guard(() => api.addInvites(s.id, emails));
    go(`#/admin/s/${s.id}/reglages`);
  };
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    const s = sessions.find((x) => x.id === b.dataset.del);
    if (!confirm(`Supprimer « ${s.title} » ? Cadrages, réponses et discussions seront effacés définitivement.`)) return;
    await guard(() => api.deleteSession(s.id), "Session supprimée.");
    go("#/admin");
  }));
  $$("[data-dup]", root).forEach((b) => (b.onclick = () => openDuplicate(api, sessions.find((x) => x.id === b.dataset.dup), go)));
  $$("[data-qr]", root).forEach((b) => (b.onclick = async () => {
    const s = sessions.find((x) => x.id === b.dataset.qr);
    showQr(s, await qr(joinUrl(s.code), 640));
  }));
}

export function parseEmails(txt) {
  return [...new Set(String(txt).toLowerCase().split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
}

// QR code plein écran, à projeter
export function showQr(s, dataUrl) {
  const d = document.createElement("div");
  d.className = "proj on";
  d.innerHTML = `<button class="btn ghost" style="float:right">Fermer</button>
    <div style="text-align:center"><h2>${T(s.title)}</h2>
    <img src="${dataUrl}" alt="QR code pour rejoindre la session" style="width:min(60vh,80vw);height:auto">
    <p style="font-size:clamp(18px,2.4vw,30px)">ou <b class="mono">${esc(joinUrlLabel(s.code))}</b></p></div>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => e.key === "Escape" && close();
  $("button", d).onclick = close; document.addEventListener("keydown", esc_);
}

/* Duplication d'une session (admin) : intitulé et dates de la nouvelle formation,
   options pour reprendre les mêmes stagiaires et les valeurs des codes d'accès.
   La copie part en brouillon ; on ouvre ses réglages pour l'ajuster. */
export function openDuplicate(api, s, go) {
  if (!s) return;
  const two = s.format === "2";
  const d = document.createElement("div");
  d.className = "modal-back";
  d.innerHTML = `<form class="card modal" role="dialog" aria-modal="true" aria-labelledby="dupH">
      <h3 id="dupH">Dupliquer « ${T(s.title)} »</h3>
      <p class="small muted" style="margin-top:0">${T("Sont repris : réglages, déroulé et activités, conducteur importé, habillage, intervenant·e, présentations, émargement, évaluation, support, mode en ligne et ressources. Ne sont jamais repris : participant·es, réponses, cadrages et discussion. La copie part en brouillon avec un nouveau code.")}</p>
      <label class="f" for="dT">Intitulé</label><input type="text" id="dT" required maxlength="140" value="${esc(s.title + " (copie)")}">
      <div class="grid g2">
        <div><label class="f" for="dD">${two ? "Jour 1" : "Date"}</label><input type="date" id="dD"></div>
        ${two ? `<div><label class="f" for="dD2">Jour 2</label><input type="date" id="dD2"></div>` : ""}
      </div>
      <label class="f inline"><input type="checkbox" id="dInv"> ${T("Reprendre les stagiaires (invitations et participant·es de la session d'origine)")}</label>
      <label class="f inline"><input type="checkbox" id="dSec"> ${T("Recopier les valeurs des codes et accès des exercices (sinon, seuls leurs intitulés)")}</label>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" type="submit">Dupliquer</button><button class="btn ghost" type="button" id="dX">Annuler</button></div>
    </form>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  d.onclick = (e) => { if (e.target === d) close(); }; // accolades : renvoyer false annulerait le clic sur « Dupliquer »
  $("#dX", d).onclick = close;
  $("#dT", d).select();
  $("form", d).onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", d); btn.disabled = true;
    const id = await guard(() => api.duplicateSession(s.id, {
      title: $("#dT", d).value.trim(), date: $("#dD", d).value || null, date2: two ? $("#dD2", d).value || null : null,
      invites: $("#dInv", d).checked, secretValues: $("#dSec", d).checked,
    }), "Session dupliquée : vérifiez ses réglages.");
    btn.disabled = false;
    if (id) { close(); go(`#/admin/s/${id}/reglages`); }
  };
}
