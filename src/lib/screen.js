/* Rendu de l'écran projeté, partagé par la page plein écran et l'aperçu
   du back-office. */
import { T, esc, dateFr } from "./dom.js";
import { QUIZ } from "../data.js";
import { currentAct, renderResults, actQuestion, countOf } from "./activities.js";
import { logosHtml, datesFr, hhmm } from "./brand.js";
import { modulesFor, typeLabel } from "./content.js";
import { slideEmbedUrl } from "../deck.js";

// d = { session, rows, participants, qrUrl, projects:[{titre,auteur,description}] }
export function screenHtml(d, compact = false) {
  const { session, rows = [], participants = 0, qrUrl = "", projects = [], branding = null, emQr = null, support = null } = d;
  const act = session.status === "live" ? currentAct(session) : null;
  const live = session.live || {};
  const view = session.status === "live" ? live.view : null;
  const mod = live.module ? modulesFor(session.format).find((m) => m.id === live.module) : null;
  // Vues pilotées hors activité : slide de titre, émargement, support, slide Drive, séquence
  if (view === "title") return `<div class="screen titleslide${compact ? " compact" : ""}">${branding ? logosHtml(branding, compact ? "" : "xl") : ""}
      <div class="kick">Formation</div><div class="scr-title">${T(session.formation)}</div>
      ${session.title !== session.formation ? `<p class="scr-sub">${T(session.title)}</p>` : ""}
      <p class="scr-date">${T(datesFr(session))} · ${hhmm(session.start_time)} – ${hhmm(session.end_time)}</p>
      ${qrUrl ? `<div class="title-join"><img src="${qrUrl}" alt="QR code"><div>Rejoignez la formation<br><b>scannez le QR code</b><br>ou code <b class="mono">${esc(session.code)}</b></div></div>` : ""}</div>`;
  if (view === "slide") {
    const src = slideEmbedUrl(session.slides_url, live.slide || 1);
    return `<div class="screen slidescreen${compact ? " compact" : ""}">${src ? `<iframe src="${esc(src)}" title="Support, page ${live.slide}" allowfullscreen loading="eager"></iframe>` : `<p class="waiting">Aucune présentation Google Slides n'est associée à la session (onglet Réglages).</p>`}
      ${compact ? `<div class="small muted" style="padding:6px 2px">Page ${live.slide || 1}${mod ? " · " + T(mod.titre) : ""}</div>` : ""}</div>`;
  }
  const idx = act ? session.activities.findIndex((a) => a.id === act.id) : -1;
  const next = idx >= 0 ? session.activities[idx + 1] : session.activities[0];
  let main;
  if (view === "emargement") {
    main = `<div class="kick">Émargement</div><div class="scr-title">Signez la feuille de présence</div>${emQr ? `<img class="scr-bigqr" src="${emQr}" alt="QR code d'émargement">` : `<p class="waiting">Aucun lien d'émargement configuré (onglet Réglages).</p>`}<p class="scr-sub">Scannez avec l'appareil photo de votre téléphone.</p>`;
  } else if (view === "support") {
    const when = support?.unlock_at ? new Date(support.unlock_at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : null;
    main = `<div class="kick">Le support</div><div class="scr-title">${support?.unlocked ? "Le support est disponible" : "Le support vous attend"}</div><p class="scr-sub">${support?.unlocked ? T("Téléchargez-le depuis le menu « Support » de votre espace.") : T(`Il sera téléchargeable dans votre espace${when ? ` à partir de ${when}` : " en fin de formation"}, menu « Support ».`)}</p>`;
  } else if (view === "module" && mod) {
    main = `<div class="kick">${T(typeLabel(mod.type))}${mod.tf ? ` · Temps fort ${mod.tf}` : ""} · ${T(mod.t[0].replace(":", " h "))} – ${T(mod.t[1].replace(":", " h "))}</div><div class="scr-title q">${T(mod.titre)}</div>${mod.obj ? `<ul class="scr-list">${mod.obj.map((x) => `<li>${T(x)}</li>`).join("")}</ul>` : ""}${mod.exo ? `<p class="scr-sub">Exercice : ${T(mod.exo.titre)} · ${mod.exo.duree} min</p>` : ""}`;
  } else if (!act) {
    main = `<div class="scr-title">${session.status === "closed" ? "Merci pour cette journée" : "La formation va commencer"}</div><p class="scr-sub">${T(session.title)}</p>`;
  } else if (act.type === "welcome") {
    main = `<div class="kick">Bienvenue</div><div class="scr-title">${T(session.title)}</div><p class="scr-sub">${T(dateFr(session.date))}</p><p class="scr-sub">Scannez le QR code ou entrez le code <b class="mono">${esc(session.code)}</b> pour suivre la journée.</p>`;
  } else if (act.type === "projects") {
    main = `<div class="kick">Les projets du groupe</div><div class="scr-projects">${projects.length ? projects.map((p) => `<div class="scr-proj"><b>${T(p.titre)}</b><span>${T(p.auteur || "")}</span><p>${T((p.description || "").slice(0, 220))}</p></div>`).join("") : `<p class="waiting">Aucun cas d'usage validé pour l'instant.</p>`}</div>`;
  } else {
    const n = countOf(rows);
    const kick = act.type === "quiz" ? `${T(QUIZ[act.quiz].titre)} · question ${(live.qi || 0) + 1} sur ${QUIZ[act.quiz].q.length}` : T(act.titre);
    main = `<div class="scr-head"><div><div class="kick">${kick}</div><div class="scr-title q">${T(actQuestion(act, live))}</div></div><div class="scr-count"><b>${n}</b><span>${n > 1 ? "réponses" : "réponse"}</span></div></div>${renderResults(act, live, rows, true)}`;
  }
  return `<div class="screen${compact ? " compact" : ""}">
    <div class="scr-top">${branding ? logosHtml(branding, "sm") : `<span class="logo">IA</span>`}<div><b>${T(session.title)}</b><div class="small">${T(datesFr(session))}</div></div>
      <div class="scr-pills"><span class="pill"><span class="dot${session.status === "live" ? " on" : ""}"></span>${session.status === "live" ? "En direct" : session.status === "closed" ? "Terminée" : "Hors ligne"}</span><span class="pill">${participants} participant${participants > 1 ? "s" : ""}</span></div></div>
    <div class="scr-body"><div class="scr-main">${main}</div>
      <div class="scr-side">${qrUrl ? `<img src="${qrUrl}" alt="QR code"><div class="small">Code <b class="mono">${esc(session.code)}</b></div>` : ""}
        ${next ? `<div class="scr-next"><div class="kick">Ensuite</div><b>${T(next.titre)}</b></div>` : ""}</div></div>
  </div>`;
}
