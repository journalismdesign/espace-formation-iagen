/* Réglages généraux : organisme de formation et logos des entreprises
   clientes, chacun en deux versions :
   - version sombre (logo) pour les fonds clairs ;
   - version claire (logo_light) pour les fonds marine. */
import { $, $$, T, esc, guard } from "../lib/dom.js";
import { fileToDataUrl, samsaHtml } from "../lib/brand.js";
import { applySkin, invalidateSkins, isHex, mix } from "../lib/skin.js";
import { MAIL_DEFAULTS, MAIL_FIELDS, renderCodeMail } from "../lib/codeMail.js";

const SUGGESTED = ["INA", "Journalism.design", "ESJ Lille", "CFJ", "Samsa"];
// Aperçu miniature d'un habillage : bandeau, bouton, pastille
const skinPreview = (k) => {
  const a = isHex(k.accent) ? k.accent : "#124F90", d = isHex(k.dark) ? k.dark : "#1F2328";
  const logo = k.logo_light ? `<img src="${esc(k.logo_light)}" alt="">` : k.logo ? `<img src="${esc(k.logo)}" alt="" style="filter:brightness(0) invert(1)">` : `<b>${esc(k.name || "")}</b>`;
  return `<div class="skin-prev" style="--a:${a};--d:${d};--t:${mix(a, 0.88)}"><div class="sp-bar">${logo}<span>${esc((k.footer || "Journalisme & IA").toUpperCase())}</span></div><div class="sp-body"><span class="sp-btn">Bouton</span><span class="sp-pill">Pratique</span><span class="sp-tint">Séquence en cours</span></div></div>`;
};

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
  const [brands, settings, skins] = await Promise.all([api.listBrands(), api.getSettings(), api.listSkins().catch(() => [])]);
  const def = settings.default_skin || "";
  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Réglages généraux</h1><p class="muted">${T("Chaque logo existe en deux versions : la version sombre s'affiche sur les fonds clairs (espace stagiaire, bandeau de l'écran), la version claire sur les fonds marine (slides de titre, entrée des stagiaires). PNG à fond transparent ou SVG, 300 Ko au plus. Si une seule version est déposée, elle sert partout.")}</p></div></div>
    <div class="card" id="skinsCard"><h3>Habillages · centres de formation</h3>
      <p class="small muted" style="margin-top:0">${T("L'habillage donne à l'espace stagiaire, aux slides d'entrée et à l'écran projeté les couleurs du centre pour lequel vous intervenez : une couleur d'accent et un logo sur une base neutre. Il se choisit pour chaque session (Réglages de la session) ; celui marqué « par défaut » s'applique aux sessions qui n'en ont pas.")}</p>
      <label class="skin-row samsa-row"><input type="radio" name="defskin" value=""${!def ? " checked" : ""}><div><b>Samsa · palette d'origine</b><div class="small muted">Marine et bleu du support, logo Samsa.</div></div><span class="small muted skin-def">${!def ? "Par défaut" : "Définir par défaut"}</span></label>
      ${skins.map((k) => `<div class="skin-row" data-skin="${k.id}">
        <div class="skin-head"><label class="radio"><input type="radio" name="defskin" value="${k.id}"${def === k.id ? " checked" : ""}> <span class="small">${def === k.id ? "Par défaut" : "Définir par défaut"}</span></label>
          <button type="button" class="iconbtn danger" data-skdel="${k.id}" aria-label="Supprimer ${esc(k.name)}">✕</button></div>
        <div class="grid g2">
          <div>
            <label class="f">Nom</label><input type="text" data-f="name" maxlength="60" value="${esc(k.name)}">
            <div class="grid g2">
              <div><label class="f">Couleur d'accent</label><div class="color-in"><input type="color" data-f="accent" value="${isHex(k.accent) ? k.accent : "#124F90"}"><input type="text" data-hex="accent" maxlength="7" value="${esc(k.accent || "#124F90")}" class="mono"></div></div>
              <div><label class="f">Couleur sombre <span class="muted">(facultatif)</span></label><div class="color-in"><input type="color" data-f="dark" value="${isHex(k.dark) ? k.dark : "#1F2328"}"><input type="text" data-hex="dark" maxlength="7" value="${esc(k.dark || "")}" placeholder="#1F2328 (anthracite)" class="mono"></div></div>
            </div>
            <label class="f">Mention du pied des écrans</label><input type="text" data-f="footer" maxlength="40" value="${esc(k.footer || "")}" placeholder="Journalisme & IA">
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button type="button" class="btn sm" data-sksave="${k.id}">Enregistrer</button><button type="button" class="btn sm ghost" data-sktry="${k.id}">Essayer sur cette page</button></div>
          </div>
          <div><label class="f">Aperçu</label><div data-prev>${skinPreview(k)}</div></div>
        </div>
        ${logoPair(`skin:${k.id}`, k.logo, k.logo_light)}
      </div>`).join("")}
      <form id="skF" style="margin-top:14px">
        <div class="askrow" style="max-width:520px"><input type="text" id="skN" maxlength="60" placeholder="Nouvel habillage (nom du centre)" required><button class="btn sm" type="submit">Ajouter</button></div>
        <div class="chips" style="margin-top:8px">${SUGGESTED.filter((n) => !skins.some((k) => k.name.toLowerCase() === n.toLowerCase())).map((n) => `<button type="button" class="chip" data-sugg="${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>
        <p class="small muted">${T("Les couleurs et logos officiels de chaque centre sont à reprendre de leur charte : rien n'est préréglé.")}</p>
      </form>
    </div>
    <div class="card" style="margin-top:14px"><h3>Organisme de formation</h3>
      <div class="grid g2" style="align-items:end">
        <div><label class="f" for="oN">Nom</label><input type="text" id="oN" maxlength="80" value="${esc(settings.org_name || "")}"><button class="btn sm" id="oSave" style="margin-top:10px">Enregistrer le nom</button>
          <p class="small muted">${T("Logo des blocs « organisme » (slides de titre, émargement). Sans logo déposé, celui de l'habillage, ou à défaut Samsa, est utilisé. Le bandeau affiche toujours le logo de l'habillage.")}</p></div>
        ${logoPair("org", settings.org_logo, settings.org_logo_light, samsaHtml(false))}
      </div>
    </div>
    <form class="card" id="mailF" style="margin-top:14px"><h3>E-mail du code d'accès · stagiaires</h3>
      <p class="small muted" style="margin-top:0">${T("Envoyé quand un·e stagiaire saisit son prénom et son e-mail. L'adresse d'expédition reste celle validée dans Brevo (secret MAIL_FROM de la fonction access).")}</p>
      <div class="grid g2">
        <div>
          <label class="f" for="mFrom">Nom de l'expéditeur</label><input type="text" id="mFrom" maxlength="70" value="${esc(settings.mail_from_name || MAIL_DEFAULTS.from_name)}">
          <label class="f" for="mSubj">Objet</label><input type="text" id="mSubj" maxlength="140" value="${esc(settings.mail_subject || MAIL_DEFAULTS.subject)}">
          <label class="f" for="mBody">Message</label><textarea id="mBody" rows="10">${esc(settings.mail_body || MAIL_DEFAULTS.body)}</textarea>
          <p class="small muted">${T("Champs remplacés à l'envoi : ")}${MAIL_FIELDS.map((f) => `<code>{${f}}</code>`).join(" ")}. ${T("Une ligne vide sépare les paragraphes. {code} seul sur sa ligne s'affiche en grand ; s'il manque, le code est ajouté à la fin.")}</p>
          <div style="display:flex;gap:8px;align-items:center"><button class="btn sm" type="submit">Enregistrer</button><button class="btn sm ghost" type="button" id="mReset">Rétablir le texte par défaut</button></div>
        </div>
        <div><label class="f">Aperçu</label><div class="mail-prev" id="mPrev"></div></div>
      </div>
    </form>
    <form class="card" id="tcF" style="margin-top:14px"><h3>Code d'accès formateur</h3>
      <p class="small muted" style="margin-top:0">${T("Demandé avant la page de connexion formateur. Il est vérifié par le serveur et stocké sous forme d'empreinte : personne ne peut le relire, notez-le.")}</p>
      <div class="askrow" style="max-width:480px"><input type="password" id="tcN" minlength="6" required autocomplete="new-password" placeholder="Nouveau code (6 caractères au moins)"><button class="btn sm" type="submit">Changer le code</button></div>
    </form>
    <div class="card" style="margin-top:14px"><h3>Entreprises clientes</h3>
      ${brands.map((b) => `<div class="brand-row"><div class="brand-name"><b>${T(b.name)}</b><button class="iconbtn danger" data-del="${b.id}" aria-label="Supprimer ${esc(b.name)}">✕</button></div>${logoPair(b.id, b.logo, b.logo_light)}</div>`).join("")}
      <form id="bF" class="askrow" style="margin-top:12px;max-width:480px"><input type="text" id="bN" maxlength="80" placeholder="Nouvelle entreprise" required><button class="btn sm" type="submit">Ajouter</button></form>
    </div>`;
  const reload = () => go(location.hash);
  $("#tcF", root).onsubmit = async (e) => { e.preventDefault(); if (await guard(() => api.setTrainerCode($("#tcN", root).value), "Code formateur changé.") !== undefined) $("#tcN", root).value = ""; };
  const save = async (id, kind, url) => {
    if (id.startsWith("skin:")) { const k = skins.find((x) => x.id === id.slice(5)); invalidateSkins(); return guard(() => api.saveSkin({ ...k, [kind === "dark" ? "logo" : "logo_light"]: url })); }
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

  /* E-mail du code d'accès : aperçu avec des valeurs d'exemple, même rendu que la fonction access */
  const sample = { prenom: "Camille", formation: "Prendre en main les IA génératives", code: "K7P2QX",
    validite: new Date(Date.now() + 864e5).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }) };
  const mailVals = () => ({ from: $("#mFrom", root).value.trim(), subject: $("#mSubj", root).value, body: $("#mBody", root).value });
  const drawMail = () => {
    const v = mailVals(), m = renderCodeMail(v, sample);
    $("#mPrev", root).innerHTML = `<div class="mp-head"><div><span class="muted">De :</span> ${esc(v.from || MAIL_DEFAULTS.from_name)}</div><div><span class="muted">Objet :</span> <b>${esc(m.subject)}</b></div></div><div class="mp-body">${m.html}</div>`;
  };
  drawMail();
  ["mFrom", "mSubj", "mBody"].forEach((id) => ($("#" + id, root).oninput = drawMail));
  $("#mReset", root).onclick = () => { $("#mFrom", root).value = MAIL_DEFAULTS.from_name; $("#mSubj", root).value = MAIL_DEFAULTS.subject; $("#mBody", root).value = MAIL_DEFAULTS.body; drawMail(); };
  $("#mailF", root).onsubmit = async (e) => {
    e.preventDefault();
    const v = mailVals(), keep = (val, def) => { const x = val.trim(); return x && x !== def ? x : null; }; // texte par défaut = rien d'enregistré
    await guard(async () => {
      await api.saveSetting("mail_from_name", keep(v.from, MAIL_DEFAULTS.from_name));
      await api.saveSetting("mail_subject", keep(v.subject, MAIL_DEFAULTS.subject));
      await api.saveSetting("mail_body", keep(v.body.replace(/\r\n/g, "\n"), MAIL_DEFAULTS.body));
    }, "E-mail du code enregistré : il s'applique aux prochains envois.");
  };
  $$("[data-del]", root).forEach((btn) => (btn.onclick = async () => { if (confirm("Supprimer cette entreprise ? Les sessions qui l'utilisent n'auront plus de logo.")) { await guard(() => api.deleteBrand(btn.dataset.del)); reload(); } }));
  $("#bF", root).onsubmit = async (e) => { e.preventDefault(); await guard(() => api.saveBrand({ name: $("#bN", root).value.trim() })); reload(); };

  /* Habillages */
  const rowVals = (row) => {
    const k = { ...skins.find((x) => x.id === row.dataset.skin) };
    $$("[data-f]", row).forEach((el) => { if (el.type !== "color") k[el.dataset.f] = el.value.trim(); });
    const hx = (f) => $(`[data-hex="${f}"]`, row).value.trim();
    k.accent = isHex(hx("accent")) ? hx("accent").toLowerCase() : k.accent;
    k.dark = isHex(hx("dark")) ? hx("dark").toLowerCase() : null;
    return k;
  };
  $$(".skin-row[data-skin]", root).forEach((row) => {
    const refresh = () => ($("[data-prev]", row).innerHTML = skinPreview(rowVals(row)));
    $$("input[type=color]", row).forEach((c) => (c.oninput = () => { $(`[data-hex="${c.dataset.f}"]`, row).value = c.value; refresh(); }));
    $$("[data-hex]", row).forEach((t) => (t.oninput = () => { if (isHex(t.value.trim())) $(`input[type=color][data-f="${t.dataset.hex}"]`, row).value = t.value.trim(); refresh(); }));
    $$("[data-f]", row).forEach((el) => el.type !== "color" && el.addEventListener("input", refresh));
  });
  $$("[data-sksave]", root).forEach((b) => (b.onclick = async () => {
    const k = rowVals(b.closest(".skin-row"));
    if (!k.name) return;
    invalidateSkins();
    if (await guard(() => api.saveSkin(k), "Habillage enregistré.")) reload();
  }));
  $$("[data-sktry]", root).forEach((b) => (b.onclick = () => { applySkin(rowVals(b.closest(".skin-row"))); }));
  $$("[data-skdel]", root).forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer cet habillage ? Les sessions qui l'utilisent reprendront l'habillage par défaut.")) return;
    invalidateSkins();
    if (def === b.dataset.skdel) await guard(() => api.saveSetting("default_skin", null));
    await guard(() => api.deleteSkin(b.dataset.skdel)); reload();
  }));
  $$('input[name="defskin"]', root).forEach((r) => (r.onchange = async () => { invalidateSkins(); await guard(() => api.saveSetting("default_skin", r.value || null), "Habillage par défaut enregistré."); reload(); }));
  const addSkin = async (name) => { invalidateSkins(); if (await guard(() => api.saveSkin({ name, accent: "#124F90" }), "Habillage ajouté : choisissez sa couleur et déposez son logo.")) reload(); };
  $("#skF", root).onsubmit = (e) => { e.preventDefault(); const n = $("#skN", root).value.trim(); if (n) addSkin(n); };
  $$("[data-sugg]", root).forEach((b) => (b.onclick = () => addSkin(b.dataset.sugg)));
}
