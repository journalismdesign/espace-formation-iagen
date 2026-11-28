/* =====================================================================
   Support PDF d'une session, depuis son deck Google Slides (Apps Script)

   Appelé par la fonction Supabase « support-pdf » (bouton « Générer le PDF » de Réglages → Support à télécharger).
   Pour la session, il :
     1. vérifie le jeton (propriété de script TOKEN) et que le deck est une présentation Google Slides de ce compte ;
     2. copie le deck dans son dossier (l'original n'est jamais modifié) ;
     3. remplace, sur la slide 1 seulement, la première date trouvée par celle de la session ;
     4. retire les pages masquées de la session et, sur demande, les slides masquées dans Google Slides ;
     5. exporte la copie en PDF dans le dossier du deck, « <titre du deck> – <date>.pdf » (un PDF du même nom est
        remplacé), partagé en lecture à toute personne disposant du lien ;
     6. met la copie à la corbeille et renvoie { ok, url, name, found, removed }.
   Si la slide 1 n'a pas de date, rien n'est créé.

   Installation (une fois, avec le compte propriétaire des decks) :
     - script.google.com → Nouveau projet « Support PDF » → coller ce fichier ;
     - Paramètres du projet → Propriétés de script : TOKEN = la même chaîne que le secret Supabase SUPPORT_SCRIPT_TOKEN ;
       facultatif : ALLOWED_FOLDERS = identifiants de dossiers séparés par des virgules, pour n'autoriser que ceux-là
       (vide : toute présentation de ce compte, quel que soit son dossier) ;
     - Déployer → Nouveau déploiement → Application Web, « Exécuter en tant que : moi », « Accès : tout le monde » ;
       autoriser Drive et Slides ; l'URL /exec va dans le secret Supabase SUPPORT_SCRIPT_URL.
     - Après une modification de ce fichier : Déployer → Gérer les déploiements → modifier → nouvelle version.
   Le motif de date est recopié de src/lib/coverDate.js entre les repères (tests/coverDate.test.mjs vérifie l'identité).
   ===================================================================== */

// >>> motif de la date de page de garde
const DAY = "(?:1er|[0-3]?\\d)";
const MONTH = "(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)";
const ITEM = DAY + "(?:\\s+" + MONTH + "(?:\\s+\\d{4})?)?";
const SEP = "(?:\\s*[-–—,]\\s*|\\s+(?:et|au)\\s+)";
const COVER_DATE_SOURCE = "(?<!\\d)(?:" + ITEM + SEP + ")*" + DAY + "\\s+" + MONTH + "\\s+\\d{4}";
// <<< motif de la date de page de garde

const COVER_DATE = new RegExp(COVER_DATE_SOURCE, "iu");

function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (_) { return out_({ ok: false, error: "requête illisible" }); }
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TOKEN");
  if (!token || body.token !== token) return out_({ ok: false, error: "jeton refusé" });
  try { return out_(exportSupport_(body, props)); }
  catch (err) { return out_({ ok: false, error: String((err && err.message) || err) }); }
}

function exportSupport_(body, props) {
  const deckId = String(body.deckId || "");
  const label = String(body.label || "").trim();
  if (!/^[\w-]{20,}$/.test(deckId)) throw new Error("présentation inconnue");
  if (!label || label.length > 80) throw new Error("date de page de garde invalide");

  const src = DriveApp.getFileById(deckId);
  if (src.getMimeType() !== MimeType.GOOGLE_SLIDES) throw new Error("le lien des slides ne mène pas à une présentation Google Slides");
  const me = Session.getEffectiveUser().getEmail();
  const owner = src.getOwner();
  if (!owner || owner.getEmail() !== me) throw new Error("cette présentation appartient à un autre compte : seules celles de " + me + " sont exportées");
  const parents = src.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const allowed = String(props.getProperty("ALLOWED_FOLDERS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed.length && allowed.indexOf(folder.getId()) < 0) throw new Error("le dossier de cette présentation n'est pas autorisé (ALLOWED_FOLDERS)");

  const name = src.getName() + " – " + label + ".pdf";
  const copy = src.makeCopy("(temporaire, support PDF) " + src.getName(), folder);
  try {
    const pres = SlidesApp.openById(copy.getId());
    const slides = pres.getSlides();
    const found = replaceCoverDate_(slides[0], label); // slide 1 seulement
    if (!found) throw new Error("date introuvable sur la page de garde (slide 1) : aucun PDF n'a été créé");
    // Pages masquées de la session (numéros du deck d'origine), puis slides masquées dans Google Slides ; jamais la page de garde
    const skip = (Array.isArray(body.skip) ? body.skip : []).map(Number).filter((n) => Number.isInteger(n) && n > 1);
    let removed = 0;
    slides.forEach((s, i) => {
      if (i > 0 && (skip.indexOf(i + 1) >= 0 || (body.dropSkipped && s.isSkipped()))) { s.remove(); removed++; }
    });
    pres.saveAndClose();
    const blob = copy.getAs(MimeType.PDF).setName(name);
    const old = folder.getFilesByName(name);
    while (old.hasNext()) { const f = old.next(); if (f.getMimeType() === MimeType.PDF) f.setTrashed(true); }
    const pdf = folder.createFile(blob);
    pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, url: "https://drive.google.com/file/d/" + pdf.getId() + "/view", name: name, found: found, removed: removed };
  } finally {
    copy.setTrashed(true);
  }
}

// Première date trouvée dans les zones de texte de la slide (groupes compris), remplacée en gardant son style
function replaceCoverDate_(slide, label) {
  const shapes = [];
  const walk = (els) => els.forEach((el) => {
    const t = el.getPageElementType();
    if (t === SlidesApp.PageElementType.SHAPE) shapes.push(el.asShape());
    else if (t === SlidesApp.PageElementType.GROUP) walk(el.asGroup().getChildren());
  });
  walk(slide.getPageElements());
  for (const sh of shapes) {
    let tr;
    try { tr = sh.getText(); } catch (_) { continue; }
    const m = COVER_DATE.exec(tr.asString());
    if (m) { tr.getRange(m.index, m.index + m[0].length).setText(label); return m[0]; }
  }
  return "";
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Essai depuis l'éditeur Apps Script : remplacer l'identifiant par celui d'un deck, puis « Exécuter »
function testExport() {
  const r = exportSupport_({ deckId: "1NVaL4iEzVdlPBho9dHDEzYaIHq2KELHiXEI4XnWeP8M", label: "1er - 2 décembre 2026", skip: [], dropSkipped: true }, PropertiesService.getScriptProperties());
  Logger.log(JSON.stringify(r));
}
