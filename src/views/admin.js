/* Back-office : liste des sessions, création, QR code, suppression. */
import QRCode from "qrcode";
import { $, $$, T, esc, guard, toast, dateFr } from "../lib/dom.js";
import { defaultActivities } from "../lib/activities.js";
import { quizKeysOf, snapshotQuizzes } from "../lib/quizzes.js";
import { modulesFor } from "../lib/content.js";
import { STATUS } from "./home.js";
import { skinDark } from "../lib/skin.js";
import { isAdmin, isGuest } from "../lib/roles.js";
import { isArchived, archiveDate, sessionEnded, trainingDates, parisToday, addDays } from "../lib/archive.js";

// Lien court de la session : <site>/CODE (redirigé vers #/join/CODE par 404.html ou au démarrage).
// VITE_SHORT_BASE permet un domaine plus court (ex. https://formation.samsa.fr/).
const SHORT_BASE = import.meta.env.VITE_SHORT_BASE;
export const joinUrl = (code) => (SHORT_BASE ? SHORT_BASE.replace(/\/?$/, "/") : location.origin + location.pathname.replace(/[^/]*$/, "")) + code;
export const joinUrlLabel = (code) => joinUrl(code).replace(/^https?:\/\//, "");
export const qr = (text, size = 320) => QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: skinDark(), light: "#ffffff" } });

export async function viewAdmin(root, [view], { api, go, me }) {
  const admin = isAdmin(me), guest = isGuest(me);
  if (guest) return viewGuestDemos(root, { api, go, me }); // invité·e : ses deux sessions de démo, rien d'autre
  const archivedTab = view === "archives";
  await api.closeFinished().catch(() => 0); // sessions finies depuis plus de 15 min : closes (aussi côté base, par pg_cron)
  const [listed, counts, brands, trainers, skins] = await Promise.all([api.listSessions(), api.memberCounts(), api.listBrands().catch(() => []),
    api.listTrainers().catch(() => []), api.listSkins().catch(() => [])]);
  const all = listed.filter((s) => !s.demo_owner); // les sessions de démo des invité·es n'apparaissent pas ici
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
    : sessionEnded(s) ? `<span class="state closed">Terminée</span>${archiveDate(s) ? `<div class="small muted archive-on">${T(`archivage le ${shortFr(archiveDate(s))}`)}</div>` : ""}`
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
    <div class="pagehead"><div><div class="kicker-d">${admin ? "Back-office · administration" : "Back-office formateur"}</div><h1>${admin ? "Sessions" : "Mes sessions"}</h1>
      ${admin ? "" : `<p class="muted">${T("Les sessions qui vous sont attribuées par l'administration. Pour en obtenir une autre, contactez-la.")}</p>`}</div>
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
      ${sessions.length ? `<table class="tbl"><thead><tr><th>Client</th><th>Session</th><th>Intervenant·e</th><th>État</th><th>Date</th><th>Code</th><th>Participants</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr${!archivedTab && sessionEnded(s) ? ' class="row-ended"' : ""}>
        <td class="client-cell">${(() => { const c = clientOf(s); return c.logo ? `<img src="${esc(c.logo)}" alt="${esc(c.name)}" title="${esc(c.name)}" class="client-logo">` : c.name ? `<span>${T(c.name)}</span>` : `<span class="muted">—</span>`; })()}</td>
        <td><a href="#/admin/s/${s.id}"><b>${T(s.title)}</b></a><div class="small muted">${T(s.formation || "")}${s.format === "2" ? " · 2 jours" : " · 1 jour"}</div></td>
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

/* ---------- Invité·e : deux sessions de démonstration ----------
   Une formation d'une journée et une de deux journées, créées à la première visite (deux au plus, côté base :
   migration …_invites_demo.sql), datées du jour. L'invité·e les pilote comme un·e formateur·ice ; elles
   n'apparaissent pas dans la liste de l'équipe. « Remettre les démos à zéro » les supprime puis les recrée. */
const DEMOS = [["1", "Démo · une journée"], ["2", "Démo · deux journées"]];
async function ensureDemos(api, me) {
  const mine = async () => (await api.listSessions()).filter((s) => s.demo_owner === me.id);
  let list = await mine();
  const missing = DEMOS.filter(([f]) => !list.some((s) => s.format === f));
  if (missing.length) {
    const bank = await api.listBank().catch(() => ({ ready: false, items: [] }));
    const today = parisToday();
    for (const [format, title] of missing) {
      const activities = defaultActivities(format, bank.items);
      await api.createSession({
        title, client: "Démonstration", date: today, ...(format === "2" ? { date2: addDays(today, 1) } : {}), format, activities, demo_owner: me.id,
        ...(bank.ready ? { quizzes: snapshotQuizzes({}, quizKeysOf(activities, modulesFor(format)), bank.items) } : {}),
      });
    }
    list = await mine();
  }
  return list.sort((a, b) => String(a.format).localeCompare(String(b.format)));
}
async function viewGuestDemos(root, { api, go, me }) {
  if (me.guest_active === false) {
    root.innerHTML = `<div class="card"><h2>Invitation terminée</h2><p class="muted">${T("Votre accès de démonstration a pris fin. Pour le prolonger, écrivez à formations@journalism.design.")}</p></div>`;
    return;
  }
  let missingMig = false;
  const demos = await ensureDemos(api, me).catch((e) => { missingMig = /demo_owner|schema cache/i.test(e.message); if (!missingMig) toast(e.message, "ko"); return null; });
  if (!demos && missingMig) { root.innerHTML = `<div class="card"><h2>Sessions de démonstration bientôt prêtes</h2><p class="muted">${T("Elles seront disponibles dès que l'équipe aura activé cette fonction (migration 20261128020000_invites_demo.sql dans Supabase). Revenez dans un moment.")}</p></div>`; return; }
  if (!demos) { root.innerHTML = `<div class="card"><h2>Sessions de démonstration indisponibles</h2><p class="muted">${T("Elles n'ont pas pu être préparées. Réessayez dans un instant, ou écrivez à formations@journalism.design.")}</p></div>`; return; }
  root.innerHTML = `
    <div class="pagehead"><div><div class="kicker-d">Invitation · démonstration</div><h1>Vos sessions de démonstration</h1>
      <p class="muted">${T("Deux sessions rien que pour vous : une formation d'une journée et une de deux journées. Réglez-les, pilotez le déroulé, lancez les sondages et les quiz, projetez l'écran, regardez le côté stagiaire : vos essais ne touchent aucune vraie session.")}</p></div>
      <div class="head-actions"><button class="btn ghost" id="gReset" type="button">Remettre les démos à zéro</button></div></div>
    <div class="grid g2">${demos.map((s) => `<a class="card demo-card" href="#/admin/s/${s.id}/jour">
      <div class="kicker-d">${s.format === "2" ? "Deux journées" : "Une journée"} · code <span class="mono">${esc(s.code)}</span></div>
      <h2>${T(s.title)}</h2>
      <p class="small muted" style="margin:0">${T(s.status === "live" ? "Salle ouverte" : "Salle fermée")}</p>
      <span class="btn sm">Ouvrir le pilotage →</span></a>`).join("")}</div>
    <p class="small muted" style="margin-top:14px">${T("Pour voir l'expérience des stagiaires, ouvrez une session puis « Voir côté stagiaire », ou rejoignez-la avec son code depuis un autre appareil et une autre adresse e-mail.")}</p>`;
  $("#gReset", root).onclick = async () => {
    if (!confirm("Remettre les deux sessions de démonstration à zéro ?\n\nRéglages, activités, participant·es, réponses et discussion seront effacés, puis deux sessions neuves recréées.")) return;
    const ok = await guard(async () => { for (const s of demos) await api.deleteSession(s.id); return true; });
    if (ok) go(location.hash);
  };
}
