/* Mise à jour d'un écran sans clignotement.
   Au lieu de remplacer tout le HTML (ce qui recharge les présentations Google Slides et fait clignoter l'écran
   à chaque événement temps réel), on compare l'ancien et le nouveau contenu et on ne touche qu'à ce qui change.
   Une présentation qui change de page est fondue : la nouvelle page se charge invisible au-dessus de l'ancienne,
   puis apparaît quand elle est prête. */

const LEAVING = "data-leaving";

export function morph(container, html) {
  if (container.__html === html) return; // rien n'a changé : on ne touche à rien
  container.__html = html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphChildren(container, tpl.content);
}

// enfants en place, sans les présentations en train de disparaître (fondu en cours)
const kids = (n) => [...n.childNodes].filter((c) => !(c.nodeType === 1 && c.hasAttribute(LEAVING)));

function morphChildren(from, to) {
  const a = kids(from), b = [...to.childNodes];
  for (let i = 0; i < b.length; i++) {
    if (i >= a.length) { from.appendChild(b[i].cloneNode(true)); continue; }
    morphNode(a[i], b[i]);
  }
  for (let i = b.length; i < a.length; i++) a[i].remove();
}

function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b.cloneNode(true)); return; }
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.nodeType !== 1) return;
  if (a.nodeName === "IFRAME") { morphIframe(a, b); return; }
  // attributs
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  morphChildren(a, b);
}

function morphIframe(a, b) {
  const next = b.getAttribute("src");
  if (a.getAttribute("src") === next) { if (a.title !== b.title) a.title = b.title; return; }
  // Fondu : la nouvelle page se charge sous un voile transparent, au-dessus de l'ancienne
  const fresh = b.cloneNode(true);
  const parent = a.parentNode;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  Object.assign(fresh.style, { position: "absolute", inset: "0", width: "100%", height: "100%", opacity: "0", transition: "opacity .25s ease" });
  a.setAttribute(LEAVING, "");
  parent.insertBefore(fresh, a.nextSibling);
  let done = false;
  const reveal = () => {
    if (done) return; done = true;
    fresh.style.opacity = "1";
    setTimeout(() => { a.remove(); Object.assign(fresh.style, { position: "", inset: "", opacity: "", transition: "" }); }, 300);
  };
  fresh.addEventListener("load", () => setTimeout(reveal, 150), { once: true }); // court délai : Google Slides finit de peindre après « load »
  setTimeout(reveal, 4000); // filet de sécurité si « load » ne vient jamais
}
