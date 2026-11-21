/* Rendu de l'écran projeté, partagé par la page plein écran et l'aperçu
   du back-office. */
import { T, esc, dateFr } from "./dom.js";
import { QUIZ } from "../data.js";
import { currentAct, renderResults, actQuestion, countOf } from "./activities.js";

// d = { session, rows, participants, qrUrl, projects:[{titre,auteur,description}] }
export function screenHtml(d, compact = false) {
  const { session, rows = [], participants = 0, qrUrl = "", projects = [] } = d;
  const act = session.status === "live" ? currentAct(session) : null;
  const live = session.live || {};
  const idx = act ? session.activities.findIndex((a) => a.id === act.id) : -1;
  const next = idx >= 0 ? session.activities[idx + 1] : session.activities[0];
  let main;
  if (!act) {
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
    <div class="scr-top"><span class="logo">IA</span><div><b>${T(session.title)}</b><div class="small">${T(session.formation)} · ${T(dateFr(session.date, { day: "numeric", month: "long", year: "numeric" }))}</div></div>
      <div class="scr-pills"><span class="pill"><span class="dot${session.status === "live" ? " on" : ""}"></span>${session.status === "live" ? "En direct" : session.status === "closed" ? "Terminée" : "Hors ligne"}</span><span class="pill">${participants} participant${participants > 1 ? "s" : ""}</span></div></div>
    <div class="scr-body"><div class="scr-main">${main}</div>
      <div class="scr-side">${qrUrl ? `<img src="${qrUrl}" alt="QR code"><div class="small">Code <b class="mono">${esc(session.code)}</b></div>` : ""}
        ${next ? `<div class="scr-next"><div class="kick">Ensuite</div><b>${T(next.titre)}</b></div>` : ""}</div></div>
  </div>`;
}
