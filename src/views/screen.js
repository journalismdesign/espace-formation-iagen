/* Écran projeté (plein écran, à ouvrir sur le vidéoprojecteur). */
import { $, debounce } from "../lib/dom.js";
import { screenHtml } from "../lib/screen.js";
import { morph } from "../lib/morph.js";
import { joinUrl, qr } from "./admin.js";
import { loadScreenData } from "./adminSession.js";

export async function viewScreen(root, [sid], { api }) {
  let session = await api.getSession(sid);
  if (!session) { root.innerHTML = `<p class="empty">Session introuvable.</p>`; return; }
  const qrUrl = await qr(joinUrl(session.code), 480);
  root.innerHTML = `<div class="screen-page"><div id="scr"></div><button class="btn ghost sm fsbtn" id="fs">Plein écran</button></div>`;
  // Dessin sans clignotement : seules les parties modifiées sont mises à jour (morph), et une réponse
  // arrivée en retard (dessin précédent plus lent) ne remplace jamais un état plus récent.
  let seq = 0;
  const draw = async () => {
    const n = ++seq;
    const s = (await api.getSession(sid).catch(() => null)) || session;
    const data = await loadScreenData(api, s).catch(() => null);
    if (n !== seq || !data) return;
    session = s;
    morph($("#scr", root), screenHtml({ ...data, session, qrUrl }));
  };
  const redraw = debounce(draw, 200);
  $("#fs", root).onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  await draw();
  const un = api.watch(sid, redraw);
  const t = setInterval(draw, 5000); // filet de sécurité si le temps réel décroche
  return () => { un(); clearInterval(t); };
}
