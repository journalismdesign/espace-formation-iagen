/* Back-office : liste des sessions, création, QR code, suppression. */
import QRCode from "qrcode";
import { $, $$, T, esc, guard, dateFr } from "../lib/dom.js";
import { defaultActivities } from "../lib/activities.js";
import { STATUS } from "./home.js";

export const joinUrl = (code) => `${location.origin}${location.pathname}#/join/${code}`;
export const qr = (text, size = 320) => QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: "#0A2D4E", light: "#ffffff" } });

export async function viewAdmin(root, _p, { api, go }) {
  const [sessions, counts] = await Promise.all([api.listSessions(), api.memberCounts()]);
  root.innerHTML = `
    <div class="pagehead"><div><div class="kicker-d">Back-office formateur</div><h1>Sessions</h1></div>
      <button class="btn" id="newBtn">+ Démarrer une session</button></div>
    <form class="card" id="newForm" hidden style="margin-bottom:14px">
      <h3>Nouvelle session</h3>
      <div class="grid g2">
        <div><label class="f" for="nTitle">Intitulé</label><input type="text" id="nTitle" required maxlength="140" placeholder="Libération · Prendre en main les IA génératives"></div>
        <div><label class="f" for="nClient">Client ou rédaction</label><input type="text" id="nClient" maxlength="80" placeholder="Libération"></div>
        <div><label class="f" for="nDate">Date (premier jour)</label><input type="date" id="nDate"></div>
        <div><label class="f" for="nFmt">Format</label><select id="nFmt"><option value="1">Une journée</option><option value="2">Deux journées</option></select></div>
      </div>
      <label class="f" for="nInv">Inviter des stagiaires (une adresse par ligne, facultatif)</label>
      <textarea id="nInv" placeholder="prenom.nom@liberation.fr"></textarea>
      <p class="small muted">${T("Chaque personne invitée retrouve la session en se connectant avec cette adresse (lien e-mail ou Google). Les autres la rejoignent avec le code ou le QR code.")}</p>
      <div style="display:flex;gap:8px"><button class="btn" type="submit">Créer la session</button><button class="btn ghost" type="button" id="nCancel">Annuler</button></div>
    </form>
    <div class="card table-card">
      ${sessions.length ? `<table class="tbl"><thead><tr><th>Session</th><th>État</th><th>Formation</th><th>Date</th><th>Code</th><th>Participants</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr>
        <td><a href="#/admin/s/${s.id}"><b>${T(s.title)}</b></a>${s.client ? `<div class="small muted">${T(s.client)}</div>` : ""}</td>
        <td><span class="state ${s.status}">${STATUS[s.status]}</span></td>
        <td class="small">${T(s.formation)}${s.format === "2" ? " · 2 jours" : ""}</td>
        <td class="small mono">${s.date || "—"}</td>
        <td class="mono">${esc(s.code)}</td>
        <td>${counts[s.id] || 0}</td>
        <td class="actions"><button class="iconbtn" data-qr="${s.id}" title="QR code" aria-label="QR code">▦</button><button class="iconbtn danger" data-del="${s.id}" title="Supprimer" aria-label="Supprimer">✕</button></td>
      </tr>`).join("")}</tbody></table>` : `<p class="empty">Aucune session. Créez la première.</p>`}
    </div>`;

  const form = $("#newForm", root);
  $("#newBtn", root).onclick = () => { form.hidden = false; $("#nTitle", root).focus(); };
  $("#nCancel", root).onclick = () => (form.hidden = true);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const format = $("#nFmt", root).value;
    const s = await guard(() => api.createSession({
      title: $("#nTitle", root).value.trim(), client: $("#nClient", root).value.trim(),
      date: $("#nDate", root).value || null, format, activities: defaultActivities(format),
    }), "Session créée.");
    if (!s) return;
    const emails = parseEmails($("#nInv", root).value);
    if (emails.length) await guard(() => api.addInvites(s.id, emails));
    go(`#/admin/s/${s.id}`);
  };
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    const s = sessions.find((x) => x.id === b.dataset.del);
    if (!confirm(`Supprimer « ${s.title} » ? Cadrages, réponses et discussions seront effacés définitivement.`)) return;
    await guard(() => api.deleteSession(s.id), "Session supprimée.");
    go("#/admin");
  }));
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
    <p style="font-size:clamp(18px,2.4vw,30px)">Ou rendez-vous sur <b>${esc(location.host)}</b> avec le code <b class="mono">${esc(s.code)}</b></p></div>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => e.key === "Escape" && close();
  $("button", d).onclick = close; document.addEventListener("keydown", esc_);
}
