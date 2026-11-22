/* Support Google Slides de la formation : ordre des slides (relevé le
   21/11/2026, 135 pages). Permet d'afficher une page précise sur l'écran
   projeté. Pour un autre support, l'affichage se fait par numéro de page. */
export const DEFAULT_DECK_ID = "1G-exjcmMujp3XtEAOMCyzR9Plk3OzgS1qnVdTI0rJkg";
export const DECK_PAGES = ["sld01", "sld02", "sld03", "som01", "dro01", "dro02", "sld04", "sld05", "sld06", "div03", "act01", "hia05", "cost01", "env01", "llm03", "lab01", "div00", "tra01", "rac01", "hia01", "hia02", "prm01", "hia03", "pqi01", "dvcom", "hia04", "llm01", "llm02", "llm04", "llm05", "llm06", "div01", "aio01", "aio02", "aio03", "div02", "pan01", "usefr1", "usefr2", "usefr3", "usefr4", "usefr5", "usefr6", "usefr7", "usefr8", "usemo1", "usemo2", "usemo3", "usemo4", "usemo5", "usemo6", "usemo7", "usemo8", "usemo9", "usemo10", "usemo11", "usemo12", "usemo13", "usemo14", "abb01", "abb02", "jou01", "jou02", "jou03", "jou04", "jou05", "jou06", "dvnbk", "nlm01", "nlm02", "nlm03", "sld07", "sld08", "sld09", "sld10", "sld11", "sld12", "sld13", "sld14", "sld15", "sld16", "sld17", "sld18", "mcp01", "mcp02", "ins01", "ins02", "sld19", "sld20", "sld21", "sld22", "sld23", "sld24", "sld25", "sld26", "sld27", "sld28", "sld29", "sld30", "sld31", "sld32", "sld33", "sld34", "nv2sa", "nv2sb", "nv2sc", "nv2sd", "nv2se", "nv2sf", "ex2s1", "ex2s2", "ex2s3", "ex2s4", "ex2s5", "ex2s6", "ex2sp", "cfg01", "cfg02", "cfg03", "sld35", "sld36", "sld37", "sld38", "sld39", "sld40", "sld41", "sld42", "sld43", "sld44", "sld45", "sld46", "sld47", "sld48", "sld49", "sld50"];

// Identifiant d'une présentation à partir de son URL (ou de l'identifiant seul)
// (lien d'édition /d/ID/…, lien publié /d/e/2PACX…/pub, ou identifiant seul)
export function deckId(urlOrId) {
  const s = String(urlOrId || "").trim();
  const pub = s.match(/presentation\/d\/e\/([\w-]{20,})/);
  if (pub) return "e/" + pub[1];
  const m = s.match(/presentation\/(?:u\/\d+\/)?d\/([\w-]{20,})/);
  return m ? m[1] : /^[\w-]{20,}$/.test(s) ? s : null;
}

// URL d'intégration d'une page (1 = première slide)
export function slideEmbedUrl(urlOrId, page) {
  const id = deckId(urlOrId); if (!id) return null;
  const p = Math.max(1, page | 0);
  const ref = id === DEFAULT_DECK_ID && DECK_PAGES[p - 1] ? "id." + DECK_PAGES[p - 1] : String(p);
  return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&rm=minimal&slide=${ref}`;
}

// « 11 à 16, 18, 24 » → [11,12,13,14,15,16,18,24]
export function parsePages(s) {
  const out = [];
  String(s || "").split(/,/).forEach((part) => {
    const m = part.match(/(\d+)\s*(?:à|-|–)\s*(\d+)/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else { const n = part.match(/\d+/); if (n) out.push(+n[0]); }
  });
  return [...new Set(out)];
}

/* ---------- Présentations supplémentaires ---------- */
// Fichier Drive (PDF, etc.) : https://drive.google.com/file/d/<id>/view
export function driveFileId(url) {
  const m = String(url || "").match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,})/);
  return m ? m[1] : null;
}
// Type de présentation : « slides » (navigation par page) ou « pdf » (aperçu Drive)
export function deckKind(url) {
  if (deckId(url) && /presentation/.test(url)) return "slides";
  if (/\.(pptx?|key|pdf)(\?|$)/i.test(url) && !driveFileId(url)) return null; // fichier hors Drive : non intégrable
  if (driveFileId(url)) return "pdf";
  return null;
}
export function deckEmbedUrl(url, page = 1) {
  const k = deckKind(url);
  if (k === "slides") return slideEmbedUrl(url, page);
  if (k === "pdf") return `https://drive.google.com/file/d/${driveFileId(url)}/preview`;
  return null;
}
