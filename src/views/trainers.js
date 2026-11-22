/* Fiches des intervenant·es : photo, fonctions, accroche, contacts.
   Elles alimentent la slide « L'intervenant » des écrans de session. */
import { keepDraft } from "../lib/draft.js";
import { $, $$, T, esc, guard, toast } from "../lib/dom.js";
import { fileToDataUrl } from "../lib/brand.js";
import { trainerSlideHtml } from "../lib/screen.js";

const EMPTY = { name: "", photo: null, roles: [{ label: "", value: "", url: "" }], tagline: "", tagline_sub: "", email: "", website: "", socials: [{ label: "", url: "" }] };

export async function viewTrainers(root, [id], { api, go }) {
  const list = await api.listTrainers();
  const cur = id === "nouveau" ? structuredClone(EMPTY) : id ? structuredClone(list.find((t) => t.id === id) || EMPTY) : null;

  if (!cur) {
    root.innerHTML = `
      <p><a href="#/admin">← Sessions</a></p>
      <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Formateurs</h1><p class="muted">${T("Une fiche par intervenant·e. Elle se choisit dans les réglages de chaque session et se projette avec l'écran « Formateur ».")}</p></div>
        <a class="btn" href="#/admin/formateurs/nouveau">+ Nouvelle fiche</a></div>
      <div class="grid g3">${list.map((t) => `<a class="card trainer-card" href="#/admin/formateurs/${t.id}">
          ${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<span class="tc-ph">${T((t.name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>`}
          <div><b>${T(t.name)}</b><div class="small muted">${T((t.roles || []).map((r) => r.label + (r.value ? " " + r.value : "")).slice(0, 2).join(" · "))}</div></div></a>`).join("") || `<p class="empty">Aucune fiche pour l'instant.</p>`}</div>`;
    return;
  }

  // Une session factice sert à l'aperçu de la slide
  const demoSession = { code: "ABC123", date: new Date().toISOString().slice(0, 10), live: {}, activities: [] };
  root.innerHTML = `
    <p><a href="#/admin/formateurs">← Formateurs</a></p>
    <div class="pagehead"><div><div class="kicker-d">Fiche formateur</div><h1>${cur.id ? T(cur.name) : "Nouvelle fiche"}</h1></div></div>
    <form id="tF" class="grid jour2">
      <div class="card">
        <label class="f" for="tN">Nom</label><input type="text" id="tN" required maxlength="100" value="${esc(cur.name)}">
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

  const read = () => {
    cur.name = $("#tN", root).value.trim(); cur.tagline = $("#tTg", root).value.trim(); cur.tagline_sub = $("#tTs", root).value.trim();
    cur.email = $("#tEm", root).value.trim(); cur.website = $("#tWs", root).value.trim();
    cur.roles = $$("#tRoles .row3", root).map((r) => ({ label: $(".rl", r).value.trim(), value: $(".rv", r).value.trim(), url: $(".ru", r).value.trim() }));
    cur.socials = $$("#tSoc .row3", root).map((r) => ({ label: $(".sl", r).value.trim(), url: $(".su", r).value.trim() }));
  };
  const preview = () => { read(); $("#tPrev", root).innerHTML = trainerSlideHtml(demoSession, { ...cur, roles: cur.roles.filter((r) => r.label), socials: cur.socials.filter((x) => x.label) }, "compact"); };
  const drawRows = () => {
    $("#tRoles", root).innerHTML = cur.roles.map((r, i) => `<div class="row3"><input class="rl" placeholder="Fondateur de" value="${esc(r.label)}"><input class="rv" placeholder="Synth" value="${esc(r.value)}"><input class="ru" placeholder="https:// (facultatif)" value="${esc(r.url || "")}"><button type="button" class="iconbtn danger" data-rr="${i}" aria-label="Retirer">✕</button></div>`).join("");
    $("#tSoc", root).innerHTML = cur.socials.map((x, i) => `<div class="row3 two"><input class="sl" placeholder="@identifiant" value="${esc(x.label)}"><input class="su" placeholder="https://bsky.app/… (facultatif)" value="${esc(x.url || "")}"><button type="button" class="iconbtn danger" data-rs="${i}" aria-label="Retirer">✕</button></div>`).join("");
    $$("[data-rr]", root).forEach((b) => (b.onclick = () => { read(); cur.roles.splice(+b.dataset.rr, 1); drawRows(); }));
    $$("[data-rs]", root).forEach((b) => (b.onclick = () => { read(); cur.socials.splice(+b.dataset.rs, 1); drawRows(); }));
    $$("#tF input", root).forEach((i) => i.type !== "file" && (i.oninput = preview));
    preview();
  };
  $("#tRa", root).onclick = () => { read(); cur.roles.push({ label: "", value: "", url: "" }); drawRows(); };
  $("#tSa", root).onclick = () => { read(); cur.socials.push({ label: "", url: "" }); drawRows(); };
  $("#tPf", root).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const url = await guard(() => fileToDataUrl(f, 500)); if (url) { cur.photo = url; $("#tPh", root).innerHTML = `<img src="${url}" class="thumb lg" alt="">`; preview(); } };
  $("#tPd", root)?.addEventListener("click", () => { cur.photo = null; $("#tPh", root).innerHTML = ""; preview(); });
  $("#tDel", root)?.addEventListener("click", async () => { if (confirm("Supprimer cette fiche ? Les sessions qui l'utilisent n'auront plus d'intervenant.")) { await guard(() => api.deleteTrainer(cur.id)); go("#/admin/formateurs"); } });
  $("#tF", root).onsubmit = async (e) => {
    e.preventDefault(); read();
    if (!cur.name) return toast("Indiquez un nom.", "ko");
    const saved = await guard(() => api.saveTrainer({ ...cur, roles: cur.roles.filter((r) => r.label), socials: cur.socials.filter((x) => x.label) }), "Fiche enregistrée.");
    if (saved && !cur.id) go(`#/admin/formateurs/${saved.id}`);
  };
  drawRows();
  keepDraft($("#tF", root), `formateur:${cur.id || "nouveau"}`, { saveLabel: "Enregistrer la fiche" });
}
