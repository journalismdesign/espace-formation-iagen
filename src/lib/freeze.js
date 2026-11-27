/* Mode invitation : gèle les commandes du back-office pour un·e invité·e. Boutons, champs, listes et lignes à
   glisser sont désactivés dès qu'ils apparaissent (vues, panneaux, fenêtres), sauf ceux qui ne font que montrer
   ou naviguer (KEEP). Les liens restent actifs. La vraie protection est en base (…_invites_lecture.sql) et l'API
   de l'invité·e rejette toute écriture (src/api/readonly.js) : ce gel évite seulement de proposer des gestes
   qui ne peuvent pas aboutir. */
import { READ_ONLY_MSG } from "./roles.js";

// Commandes qui ne modifient rien : fermer un panneau, se déconnecter, changer de jour ou de conversation,
// ouvrir l'écran projeté, voir un cadrage, copier un lien, plein écran, télécharger le conducteur, QR code
const KEEP = [
  "[data-ro-ok]", "#sheetX", "#logout", ".chat-conv", ".chat-back", "[data-mday]", "#openScr", "[data-proj]",
  "#cpL", "#fsQ", "#condExport", "[data-qr]", "[data-pa='ok']", "#fs", "#olFs",
].join(",");
const CONTROLS = "button, input, select, textarea, [draggable='true']";

function freezeOne(c) {
  if (c.matches(KEEP)) return;
  if (c.getAttribute("draggable") === "true") c.setAttribute("draggable", "false");
  if ("disabled" in c && !c.disabled) {
    c.disabled = true;
    if (!c.title) c.title = READ_ONLY_MSG;
  }
}

export function freezeControls(root) {
  const scan = (el) => { if (el.nodeType !== 1) return; if (el.matches(CONTROLS)) freezeOne(el); el.querySelectorAll(CONTROLS).forEach(freezeOne); };
  scan(root);
  const mo = new MutationObserver((list) => list.forEach((m) => {
    if (m.type === "attributes") return scan(m.target); // un bouton réactivé par la vue (disabled = false) est regelé
    m.addedNodes.forEach(scan);
  }));
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "draggable"] });
  return () => mo.disconnect();
}
