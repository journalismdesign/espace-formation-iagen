/* Réglages généraux : organisme de formation et logos des entreprises
   clientes (Radio France, France Télévisions, Libération préenregistrés). */
import { $, $$, T, esc, guard } from "../lib/dom.js";
import { fileToDataUrl } from "../lib/brand.js";

export async function viewSettings(root, _p, { api, go }) {
  const [brands, settings] = await Promise.all([api.listBrands(), api.getSettings()]);
  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Réglages généraux</h1><p class="muted">${T("Ces logos apparaissent sur la slide d'ouverture, l'écran projeté et l'espace des stagiaires. Préférez des PNG à fond transparent ou des SVG, 300 Ko au plus.")}</p></div></div>
    <div class="grid g2">
      <div class="card"><h3>Organisme de formation</h3>
        <label class="f" for="oN">Nom</label><input type="text" id="oN" maxlength="80" value="${esc(settings.org_name || "")}">
        <label class="f">Logo</label>
        <div style="display:flex;gap:10px;align-items:center"><span class="logo-tile">${settings.org_logo ? `<img src="${esc(settings.org_logo)}" alt="">` : T(settings.org_name || "—")}</span><input type="file" id="oL" accept="image/*">${settings.org_logo ? `<button class="linkbtn small" id="oDel">Retirer</button>` : ""}</div>
        <button class="btn sm" id="oSave" style="margin-top:12px">Enregistrer le nom</button>
      </div>
      <div class="card"><h3>Entreprises clientes</h3>
        ${brands.map((b) => `<div class="prow"><span style="display:flex;gap:10px;align-items:center"><span class="logo-tile">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : "—"}</span><b>${T(b.name)}</b></span>
          <span><label class="btn sm ghost" style="cursor:pointer">Logo…<input type="file" accept="image/*" data-logo="${b.id}" hidden></label>${b.logo ? `<button class="linkbtn small" data-clear="${b.id}">Retirer</button>` : ""}<button class="iconbtn danger" data-del="${b.id}" aria-label="Supprimer">✕</button></span></div>`).join("")}
        <form id="bF" class="askrow" style="margin-top:12px"><input type="text" id="bN" maxlength="80" placeholder="Nouvelle entreprise" required><button class="btn sm" type="submit">Ajouter</button></form>
      </div>
    </div>`;
  const reload = () => go(location.hash);
  $("#oSave", root).onclick = async () => { await guard(() => api.saveSetting("org_name", $("#oN", root).value.trim()), "Enregistré."); };
  $("#oL", root).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const url = await guard(() => fileToDataUrl(f)); if (url && (await guard(() => api.saveSetting("org_logo", url)) !== undefined)) reload(); };
  $("#oDel", root)?.addEventListener("click", async () => { await guard(() => api.saveSetting("org_logo", null)); reload(); });
  $$("[data-logo]", root).forEach((inp) => (inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const url = await guard(() => fileToDataUrl(f)); if (!url) return;
    const b = brands.find((x) => x.id === inp.dataset.logo);
    await guard(() => api.saveBrand({ ...b, logo: url }), "Logo enregistré."); reload();
  }));
  $$("[data-clear]", root).forEach((btn) => (btn.onclick = async () => { const b = brands.find((x) => x.id === btn.dataset.clear); await guard(() => api.saveBrand({ ...b, logo: null })); reload(); }));
  $$("[data-del]", root).forEach((btn) => (btn.onclick = async () => { if (confirm("Supprimer cette entreprise ? Les sessions qui l'utilisent n'auront plus de logo.")) { await guard(() => api.deleteBrand(btn.dataset.del)); reload(); } }));
  $("#bF", root).onsubmit = async (e) => { e.preventDefault(); await guard(() => api.saveBrand({ name: $("#bN", root).value.trim() })); reload(); };
}
