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
  if (a.nodeType === 1 && a.classList.contains("frame") && b.classList?.contains("frame")) { morphFrame(a, b); return; }
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

/* Cadre de présentation : une page affichée + la suivante préchargée (data-preload), invisible.
   Si la page demandée est déjà chargée (préchargement), on l'affiche aussitôt ; sinon fondu classique. */
function morphFrame(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  const want = [...b.children];
  const shown = want.find((x) => x.nodeName === "IFRAME" && !x.hasAttribute("data-preload"));
  const pre = want.find((x) => x.hasAttribute("data-preload"));
  if (!shown) { morphChildren(a, b); return; } // pas de présentation (message à la place)
  const live = [...a.querySelectorAll(":scope > iframe")].filter((f) => !f.hasAttribute(LEAVING));
  [...a.children].forEach((c) => { if (c.nodeName !== "IFRAME") c.remove(); }); // ancien contenu non-iframe
  const cur = live.find((f) => !f.hasAttribute("data-preload"));
  const ready = live.find((f) => f.getAttribute("src") === shown.getAttribute("src"));
  if (ready && ready !== cur) {
    // la page préchargée devient la page affichée, instantanément
    ready.removeAttribute("data-preload"); ready.removeAttribute("aria-hidden"); ready.removeAttribute("tabindex");
    ready.title = shown.title; ready.setAttribute("allowfullscreen", "");
    if (cur) cur.remove();
  } else if (cur) morphIframe(cur, shown);
  else a.appendChild(shown.cloneNode(true));
  // préchargement de la page d'après
  const oldPre = [...a.querySelectorAll(":scope > iframe[data-preload]")];
  if (pre && oldPre[0]?.getAttribute("src") === pre.getAttribute("src")) oldPre.slice(1).forEach((f) => f.remove());
  else { oldPre.forEach((f) => f.remove()); if (pre) a.appendChild(pre.cloneNode(true)); }
}
