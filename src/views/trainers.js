/* Fiches des intervenant·es : photo, fonctions, accroche, contacts, adresse de connexion.
   Elles alimentent la slide « L'intervenant » des écrans de session et donnent accès aux sessions attribuées.
   Affichées dans « Équipe et accès », onglet « Fiches intervenant·es » (#/admin/equipe/fiches[/<id>|/nouveau]). */
import { keepDraft } from "../lib/draft.js";
import { $, $$, T, esc, guard, toast } from "../lib/dom.js";
import { fileToDataUrl } from "../lib/brand.js";
import { trainerSlideHtml } from "../lib/screen.js";

const BASE = "#/admin/equipe/fiches";
const EMPTY = { name: "", photo: null, roles: [{ label: "", value: "", url: "" }], tagline: "", tagline_sub: "", email: "", website: "", socials: [{ label: "", url: "" }] };

// Anciennes adresses (#/admin/formateurs[/<id>]) : renvoi vers l'onglet de « Équipe et accès »
export function viewTrainers(_root, [id]) { location.replace(id ? `${BASE}/${id}` : BASE); }

// État de l'accès d'une fiche, d'après la liste de l'équipe (adresse de connexion autorisée ou non)
export function accessOf(t, staff) {
  if (!t.login_email) return { cls: "", txt: "Présentation seulement : pas d'accès au back-office" };
  const s = staff.find((x) => x.email === t.login_email);
  return s ? { cls: "ok", txt: `Accès actif · ${s.is_admin ? "admin" : "formateur·ice"}` } : { cls: "ko", txt: "Adresse non autorisée : à ajouter dans « Comptes et accès »" };
}

export function trainersListHtml(list, staff) {
  return `<div class="grid g3">${list.map((t) => { const a = accessOf(t, staff); return `<a class="card trainer-card" href="${BASE}/${t.id}">
      ${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<span class="tc-ph">${T((t.name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>`}
      <div><b>${T(t.name)}</b><div class="small muted">${T((t.roles || []).map((r) => r.label + (r.value ? " " + r.value : "")).slice(0, 2).join(" · "))}</div>
        <div class="small tc-access ${a.cls}">${t.login_email ? esc(t.login_email) + "<br>" : ""}${T(a.txt)}</div></div></a>`; }).join("") || `<p class="empty">Aucune fiche pour l'instant.</p>`}</div>`;
}

export async function renderTrainerEditor(box, id, { api, go, list, staff }) {
  const cur = id === "nouveau" ? structuredClone(EMPTY) : structuredClone(list.find((t) => t.id === id) || EMPTY);
  // Une session factice sert à l'aperçu de la slide
  const demoSession = { code: "ABC123", date: new Date().toISOString().slice(0, 10), live: {}, activities: [] };
  box.innerHTML = `
    <p style="margin-top:0"><a href="${BASE}">← Toutes les fiches</a></p>
    <h2 style="margin:0 0 12px">${cur.id ? T(cur.name) : "Nouvelle fiche"}</h2>
    <form id="tF" class="grid jour2">
      <div class="card">
        <label class="f" for="tN">Nom</label><input type="text" id="tN" required maxlength="100" value="${esc(cur.name)}">
        <label class="f" for="tLog">Adresse de connexion (compte formateur·ice)</label><input type="email" id="tLog" maxlength="200" value="${esc(cur.login_email || "")}" placeholder="prenom.nom@exemple.fr">
        <p class="small muted" style="margin:2px 0 0" id="tAcc"></p>
        <label class="f">Photo (carrée de préférence)</label>
        <div style="display:flex;gap:12px;align-items:center"><span id="tPh">${cur.photo ? `<img src="${esc(cur.photo)}" class="thumb lg" alt="">` : ""}</span><input type="file" id="tPf" accept="image/*">${cur.photo ? `<button type="button" class="linkbtn small" id="tPd">Retirer</button>` : ""}</div>
        <label class="f">Fonctions (une ligne chacune : intitulé ▸ structure)</label>
        <div id="tRoles"></div><button type="button" class="btn sm ghost" id="tRa">+ Ajouter une fonction</button>
        <label class="f" for="tTg">Accroche</label><input type="text" id="tTg" maxlength="300" value="${esc(cur.tagline || "")}" placeholder="Depuis **fin 2017**, je travaille sur **les médias synthétiques**">
        <p class="small muted" style="margin:2px 0 0">${T("Entourez de doubles astérisques les mots à mettre en bleu : **comme ceci**.")}</p>
        <label class="f" for="tTs">Sous-titre de l'accroche</label><input type="text" id="tTs" maxlength="200" value="${esc(cur.tagline_sub || "")}" placeholder="Deepfakes & IA génératives">
        <div class="grid g2">
          <div><label class="f" for="tEm">E-mail professionnel</label><input type="email" id="tEm" value="${esc(cur.email || "")}"></div>
          <div><label class="f" for="tWs">Site</label><input type="url" id="tWs" value="${esc(cur.website || "")}" placeholder="https://"></div>
        </div>
        <label class="f">Réseaux sociaux</label>
        <div id="tSoc"></div><button type="button" class="btn sm ghost" id="tSa">+ Ajouter un réseau</button>
        <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" type="submit">Enregistrer</button>${cur.id ? `<button type="button" class="btn ghost danger-btn" id="tDel">Supprimer la fiche</button>` : ""}</div>
      </div>
      <aside class="jour-side"><div class="kicker-d" style="margin-bottom:6px">Aperçu de la slide</div><div id="tPrev" class="preview"></div></aside>
    </form>`;

  // Sous l'adresse de connexion : ce qu'elle permet, et si elle figure bien dans les comptes de l'équipe
  const drawAccess = () => {
    const a = accessOf({ login_email: $("#tLog", box).value.trim().toLowerCase() }, staff);
    $("#tAcc", box).innerHTML = `${T("La personne qui se connecte avec cette adresse voit les sessions attribuées à cette fiche.")} <span class="tc-access ${a.cls}">${T(a.txt)}</span>${a.cls === "ko" ? ` · <a href="#/admin/equipe/comptes">Comptes et accès</a>` : ""}`;
  };
  const read = () => {
    cur.name = $("#tN", box).value.trim(); cur.login_email = $("#tLog", box).value.trim().toLowerCase(); cur.tagline = $("#tTg", box).value.trim(); cur.tagline_sub = $("#tTs", box).value.trim();
    cur.email = $("#tEm", box).value.trim(); cur.website = $("#tWs", box).value.trim();
    cur.roles = $$("#tRoles .row3", box).map((r) => ({ label: $(".rl", r).value.trim(), value: $(".rv", r).value.trim(), url: $(".ru", r).value.trim() }));
    cur.socials = $$("#tSoc .row3", box).map((r) => ({ label: $(".sl", r).value.trim(), url: $(".su", r).value.trim() }));
  };
  const preview = () => { read(); $("#tPrev", box).innerHTML = trainerSlideHtml(demoSession, { ...cur, roles: cur.roles.filter((r) => r.label), socials: cur.socials.filter((x) => x.label) }, "compact"); };
  const drawRows = () => {
    $("#tRoles", box).innerHTML = cur.roles.map((r, i) => `<div class="row3"><input class="rl" placeholder="Fondateur de" value="${esc(r.label)}"><input class="rv" placeholder="Synth" value="${esc(r.value)}"><input class="ru" placeholder="https:// (facultatif)" value="${esc(r.url || "")}"><button type="button" class="iconbtn danger" data-rr="${i}" aria-label="Retirer">✕</button></div>`).join("");
    $("#tSoc", box).innerHTML = cur.socials.map((x, i) => `<div class="row3 two"><input class="sl" placeholder="@identifiant" value="${esc(x.label)}"><input class="su" placeholder="https://bsky.app/… (facultatif)" value="${esc(x.url || "")}"><button type="button" class="iconbtn danger" data-rs="${i}" aria-label="Retirer">✕</button></div>`).join("");
    $$("[data-rr]", box).forEach((b) => (b.onclick = () => { read(); cur.roles.splice(+b.dataset.rr, 1); drawRows(); }));
    $$("[data-rs]", box).forEach((b) => (b.onclick = () => { read(); cur.socials.splice(+b.dataset.rs, 1); drawRows(); }));
    $$("#tF input", box).forEach((i) => i.type !== "file" && (i.oninput = preview));
    $("#tLog", box).addEventListener("input", drawAccess);
    preview();
  };
  $("#tRa", box).onclick = () => { read(); cur.roles.push({ label: "", value: "", url: "" }); drawRows(); };
  $("#tSa", box).onclick = () => { read(); cur.socials.push({ label: "", url: "" }); drawRows(); };
  $("#tPf", box).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const url = await guard(() => fileToDataUrl(f, 500)); if (url) { cur.photo = url; $("#tPh", box).innerHTML = `<img src="${url}" class="thumb lg" alt="">`; preview(); } };
  $("#tPd", box)?.addEventListener("click", () => { cur.photo = null; $("#tPh", box).innerHTML = ""; preview(); });
  $("#tDel", box)?.addEventListener("click", async () => { if (confirm("Supprimer cette fiche ? Les sessions qui l'utilisent n'auront plus d'intervenant.")) { await guard(() => api.deleteTrainer(cur.id)); go(BASE); } });
  $("#tF", box).onsubmit = async (e) => {
    e.preventDefault(); read();
    if (!cur.name) return toast("Indiquez un nom.", "ko");
    const saved = await guard(() => api.saveTrainer({ ...cur, roles: cur.roles.filter((r) => r.label), socials: cur.socials.filter((x) => x.label) }), "Fiche enregistrée.");
    if (saved && !cur.id) go(`${BASE}/${saved.id}`);
  };
  drawRows(); drawAccess();
  keepDraft($("#tF", box), `formateur:${cur.id || "nouveau"}`, { saveLabel: "Enregistrer la fiche" });
}
