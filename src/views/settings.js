/* Réglages généraux : organisme de formation et logos des entreprises
   clientes, chacun en deux versions :
   - version sombre (logo) pour les fonds clairs ;
   - version claire (logo_light) pour les fonds marine. */
import { $, $$, T, esc, guard } from "../lib/dom.js";
import { fileToDataUrl, samsaHtml } from "../lib/brand.js";

// Deux emplacements côte à côte, chacun prévisualisé sur son fond
export function logoPair(id, dark, light, fallback = "") {
  const slot = (kind, val, label, bg) => `<div class="logo-slot ${bg}">
      <div class="logo-prev">${val ? `<img src="${esc(val)}" alt="">` : fallback || `<span class="small">Aucun</span>`}</div>
      <div class="small"><b>${label}</b></div>
      <div class="chips"><label class="btn sm ghost" style="cursor:pointer">Déposer…<input type="file" accept="image/*" data-up="${id}" data-kind="${kind}" hidden></label>${val ? `<button type="button" class="linkbtn small" data-rm="${id}" data-kind="${kind}">Retirer</button>` : ""}</div>
    </div>`;
  return `<div class="logo-pair">${slot("dark", dark, "Version sombre · fonds clairs", "on-light")}${slot("light", light, "Version claire · fonds marine", "on-dark")}</div>`;
}

export async function viewSettings(root, _p, { api, go }) {
  const [brands, settings] = await Promise.all([api.listBrands(), api.getSettings()]);
  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Réglages généraux</h1><p class="muted">${T("Chaque logo existe en deux versions : la version sombre s'affiche sur les fonds clairs (espace stagiaire, bandeau de l'écran), la version claire sur les fonds marine (slides de titre, entrée des stagiaires). PNG à fond transparent ou SVG, 300 Ko au plus. Si une seule version est déposée, elle sert partout.")}</p></div></div>
    <div class="card"><h3>Organisme de formation</h3>
      <div class="grid g2" style="align-items:end">
        <div><label class="f" for="oN">Nom</label><input type="text" id="oN" maxlength="80" value="${esc(settings.org_name || "")}"><button class="btn sm" id="oSave" style="margin-top:10px">Enregistrer le nom</button>
          <p class="small muted">${T("Sans logo déposé, le logo Samsa intégré est utilisé (il reste toujours dans le bandeau bleu).")}</p></div>
        ${logoPair("org", settings.org_logo, settings.org_logo_light, samsaHtml(false))}
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Entreprises clientes</h3>
      ${brands.map((b) => `<div class="brand-row"><div class="brand-name"><b>${T(b.name)}</b><button class="iconbtn danger" data-del="${b.id}" aria-label="Supprimer ${esc(b.name)}">✕</button></div>${logoPair(b.id, b.logo, b.logo_light)}</div>`).join("")}
      <form id="bF" class="askrow" style="margin-top:12px;max-width:480px"><input type="text" id="bN" maxlength="80" placeholder="Nouvelle entreprise" required><button class="btn sm" type="submit">Ajouter</button></form>
    </div>`;
  const reload = () => go(location.hash);
  const save = async (id, kind, url) => {
    if (id === "org") return guard(() => api.saveSetting(kind === "dark" ? "org_logo" : "org_logo_light", url));
    const b = brands.find((x) => x.id === id);
    return guard(() => api.saveBrand({ ...b, [kind === "dark" ? "logo" : "logo_light"]: url }));
  };
  $$("[data-up]", root).forEach((inp) => (inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const url = await guard(() => fileToDataUrl(f)); if (!url) return;
    await save(inp.dataset.up, inp.dataset.kind, url); reload();
  }));
  $$("[data-rm]", root).forEach((btn) => (btn.onclick = async () => { await save(btn.dataset.rm, btn.dataset.kind, null); reload(); }));
  $("#oSave", root).onclick = () => guard(() => api.saveSetting("org_name", $("#oN", root).value.trim()), "Enregistré.");
  $$("[data-del]", root).forEach((btn) => (btn.onclick = async () => { if (confirm("Supprimer cette entreprise ? Les sessions qui l'utilisent n'auront plus de logo.")) { await guard(() => api.deleteBrand(btn.dataset.del)); reload(); } }));
  $("#bF", root).onsubmit = async (e) => { e.preventDefault(); await guard(() => api.saveBrand({ name: $("#bN", root).value.trim() })); reload(); };
}
