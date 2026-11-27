/* Contenus pédagogiques partagés : parcours, quiz, fiches, prompts, outils,
   assistant. Repris de la version claude.ai et rendus indépendants du
   stockage (la progression est passée en paramètre). */
import { FICHES, GLOSS, PROMPTS, CASES, D1, D2, D2B, DAY_TITLES, CC, CCL, IDEES } from "../data.js";
import { dateOfDay } from "./archive.js";
import { quizFor, pollFor } from "./quizzes.js";
import { T, esc, fr, $, $$, NB, norm, mins, hfr, fmtMin, bindCopy } from "./dom.js";
import { applyEnds } from "./programme.js";

export const ficheById = (id) => FICHES.find((f) => f.id === id);
// Déroulé d'une session : conducteur importé (sessions.programme) s'il existe, sinon déroulé par défaut du format.
// Accepte la session entière ou, pour les anciens appels, le seul format ("1" ou "2").
// Créneaux d'émargement : arrivée du matin (heure de début) et reprise de l'après-midi (fin du déjeuner),
// pour chaque journée ; sur la dernière, l'évaluation de fin de stage avant la dernière séquence.
export function emargementSlots(session) {
  const all = modulesFor(session);
  const days = Array.from({ length: daysOf(session).n }, (_, i) => i + 1);
  const own = !!session.programme?.modules?.length; // conducteur ou trame : chaque journée commence à sa première séquence
  return days.flatMap((d) => {
    const dm = all.filter((m) => (m.day || 1) === d);
    const lunch = dm.find((m) => m.type === "pause" && /jeuner/i.test(m.titre));
    const am = String((own && dm[0]?.t[0]) || session.start_time || dm[0]?.t[0] || "09:30").slice(0, 5);
    const pm = lunch ? lunch.t[1] : "13:30";
    const date = dateOfDay(session, d);
    const out = [{ key: `j${d}-matin`, day: d, t: am, label: "Émargement du matin", date }, { key: `j${d}-aprem`, day: d, t: pm, label: "Émargement de l'après-midi", date }];
    if (d === days[days.length - 1]) { const last = dm.filter((m) => m.type !== "pause").pop(); if (last) out.push({ key: `j${d}-eval`, day: d, t: last.t[0], label: "Évaluation de fin de stage", date, kind: "evaluation" }); }
    return out;
  });
}
// Heure de Paris : date du jour (AAAA-MM-JJ) et minutes depuis minuit
export function parisNow(d = new Date()) {
  const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return { date: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }), min: h * 60 + m };
}
// Côté stagiaire : créneau d'émargement ouvert maintenant (de l'heure prévue à 30 min après), ou null
export function emargementOpen(session, d = new Date()) {
  const n = parisNow(d), toM = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return emargementSlots(session).find((x) => !x.kind && x.date === n.date && n.min >= toM(x.t) && n.min < toM(x.t) + 30) || null;
}
/* Niveau du jour 2 (deux journées, déroulé par défaut) : sessions.programme.level vaut "debutant" (R·M·C·T·F, puis
   ateliers en groupe, D2B) ; absent, c'est le niveau expert (le jour 2 de D2). Sans effet sur un conducteur importé. */
export const levelOf = (x) => (x && typeof x === "object" && x.programme?.level === "debutant" ? "debutant" : "expert");
export const defaultModules = (x) => (x && typeof x === "object" ? (x.format === "2" ? (levelOf(x) === "debutant" ? D2B : D2) : D1) : x === "2" ? D2 : D1);
// Déroulé de base (sans les heures de fin modifiées) : sert au déplacement des pauses et aux bornes de la fin de journée
export const baseModules = (x) => (x && typeof x === "object" && x.programme?.modules?.length ? x.programme.modules : defaultModules(x));
// Déroulé effectif : heures de fin de journée appliquées (sessions.programme.ends, programme.js). Même tableau tant que rien ne change.
const fitted = new WeakMap();
export const modulesFor = (x) => {
  const base = baseModules(x), ends = x && typeof x === "object" ? x.programme?.ends : null;
  if (!ends || typeof ends !== "object" || !Object.keys(ends).length) return base;
  const key = JSON.stringify(ends);
  let byEnds = fitted.get(base);
  if (!byEnds) fitted.set(base, (byEnds = new Map()));
  if (!byEnds.has(key)) byEnds.set(key, applyEnds(base, ends));
  return byEnds.get(key);
};
// Nombre de journées et titres des journées
export const daysOf = (x) => {
  const mods = modulesFor(x), n = Math.max(1, ...mods.map((m) => m.day || 1));
  const titles = x && typeof x === "object" && x.programme?.modules?.length ? x.programme.days || {} : n > 1 ? DAY_TITLES[levelOf(x)] : {};
  return { n, titles };
};
export const typeLabel = (t) => ({ comprendre: "Comprendre", pratique: "Pratique", discussion: "Discussion libre", pause: "Pause" }[t]);

export function totals(list) {
  const t = { comprendre: 0, pratique: 0, discussion: 0 };
  list.forEach((m) => { if (m.type !== "pause") t[m.type] += mins(m.t[1]) - mins(m.t[0]); });
  return t;
}

/* ---------- Panneau latéral (fiche, prompt) ---------- */
export function openSheet(html) {
  let ov = $("#ov"), sh = $("#sheet");
  if (!sh) {
    document.body.insertAdjacentHTML("beforeend", `<div class="overlay" id="ov"></div><aside class="sheet" id="sheet" aria-hidden="true"><button class="x" id="sheetX" aria-label="Fermer">×</button><div id="sheetBody"></div></aside>`);
    ov = $("#ov"); sh = $("#sheet");
    $("#sheetX").onclick = closeSheet; ov.onclick = closeSheet;
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
  }
  $("#sheetBody").innerHTML = html;
  sh.classList.add("on"); ov.classList.add("on"); sh.setAttribute("aria-hidden", "false"); sh.scrollTop = 0;
  bindRefs($("#sheetBody"));
  bindCopy($("#sheetBody"));
}
export function closeSheet() { $("#sheet")?.classList.remove("on"); $("#ov")?.classList.remove("on"); }

export function ficheHtml(f, full = false) {
  const sec = f.sections.map(([h, c]) => `<div class="sec"><h4>${T(h)}</h4>${Array.isArray(c) ? `<ul>${c.map((x) => `<li>${T(x)}</li>`).join("")}</ul>` : c.includes("\n") ? `<div class="prompt">${esc(c)}</div>` : `<p style="margin:0">${T(c)}</p>`}</div>`).join("");
  return `<span class="pill">Fiche pratique</span><h2>${T(f.titre)}</h2><p class="lead" style="margin-bottom:6px">${T(f.resume)}</p>${sec}
   ${f.warn ? `<div class="warn small"><b>À retenir.</b> ${T(f.warn)}</div>` : ""}
   <p class="small muted">Support : pages ${T(f.pages)}</p>
   <div class="chips">${f.prompt ? `<button class="chip" data-prompt="${f.prompt}">Prompt à adapter</button>` : ""}${(f.liens || []).map((l) => (ficheById(l) ? `<button class="chip" data-fiche="${l}">${T(ficheById(l).titre)}</button>` : "")).join("")}</div>`;
}
export function openFiche(id) { const f = ficheById(id); if (f) openSheet(ficheHtml(f)); }
export function openPrompt(id) {
  const p = PROMPTS.find((x) => x.id === id); if (!p) return;
  openSheet(`<span class="pill">${T(p.tag)}</span><h2>${T(p.titre)}</h2><p class="small muted">Support : page ${p.page}. Remplacez les passages entre crochets.</p><div class="prompt" id="sp-${p.id}" style="max-height:none">${esc(p.txt)}</div><button class="btn sm" data-copy="sp-${p.id}">Copier le prompt</button>`);
}
export function bindRefs(root) {
  $$("[data-fiche]", root).forEach((b) => (b.onclick = (e) => { e.preventDefault(); openFiche(b.dataset.fiche); }));
  $$("[data-prompt]", root).forEach((b) => (b.onclick = (e) => { e.preventDefault(); openPrompt(b.dataset.prompt); }));
}

/* ---------- Quiz (en autonomie) ---------- */
// quiz : { titre, questions: [{ id, q, o, ok, why }] } (quizFor, quizzes.js)
export function renderQuiz(box, quiz, onScore) {
  const L = quiz?.questions || []; let answered = 0, good = 0;
  if (!L.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="quiz">${L.map((q, i) => `<div class="qq" data-i="${i}"><p>${i + 1}. ${T(q.q)}</p>${q.o.map((o, j) => `<button class="opt" data-j="${j}">${T(o)}</button>`).join("")}</div>`).join("")}<div class="score" data-score></div></div>`;
  $$(".qq", box).forEach((qq) => {
    const q = L[+qq.dataset.i];
    $$(".opt", qq).forEach((b) => (b.onclick = () => {
      if (qq.dataset.done) return; qq.dataset.done = 1; answered++;
      const j = +b.dataset.j, ok = j === q.ok; if (ok) good++;
      b.classList.add(ok ? "ok" : "ko"); $$(".opt", qq)[q.ok]?.classList.add("ok");
      qq.insertAdjacentHTML("beforeend", `<div class="expl"><b>${ok ? "Juste." : "Pas tout à fait."}</b> ${T(q.why || "")}</div>`);
      if (answered === L.length) {
        $("[data-score]", box).innerHTML = T(`Score : ${good} sur ${L.length}. `) + `<button class="btn sm ghost" data-again>Recommencer</button>`;
        onScore?.(good);
        $("[data-again]", box).onclick = () => renderQuiz(box, quiz, onScore);
      }
    }));
  });
}

/* ---------- Parcours de la journée ---------- */
// progress = { done:{id:true}, quiz:{id:score} } ; onChange(progress) sauvegarde
export function renderParcours(root, format, progress, onChange, opts = {}) {
  const list0 = modulesFor(format), D = daysOf(format);
  const curMod = opts.currentId ? list0.find((m) => m.id === opts.currentId) : null;
  let curDay = curMod?.day || 1;
  const list = list0, t = totals(list), tot = t.comprendre + t.pratique + t.discussion;
  const pct = (k) => Math.round((t[k] / tot) * 100);
  const draw = () => {
    const mods = list.filter((m) => D.n < 2 || (m.day || 1) === curDay);
    const nm = new Date().getHours() * 60 + new Date().getMinutes();
    const curIdx = curMod ? list.indexOf(curMod) : -1; // position pilotée par le formateur
    root.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap"><span class="big">${pct("pratique")}${NB}%</span><span class="muted">${T(`de pratique : ${fmtMin(t.pratique)} sur ${fmtMin(tot)} de formation, hors pauses`)}</span></div>
        <div class="split"><span style="width:${pct("comprendre")}%;background:var(--comp)"></span><span style="width:${pct("pratique")}%;background:var(--prat)"></span><span style="width:${pct("discussion")}%;background:var(--disc)"></span></div>
        <div class="legend">${[["comprendre", "Comprendre", "var(--comp)"], ["pratique", "Pratique", "var(--prat)"], ["discussion", "Discussion libre", "var(--disc)"]].map(([k, l, c]) => `<span><b style="background:${c}"></b>${l} · ${fmtMin(t[k])}</span>`).join("")}</div>
      </div>
      ${D.n > 1 ? `<div class="days">${Array.from({ length: D.n }, (_, k) => k + 1).map((d) => `<button data-day="${d}" aria-pressed="${d === curDay}">Jour ${d}${D.titles[d] ? ` · ${T(D.titles[d])}` : ""}</button>`).join("")}</div>` : ""}
      <div class="tl">${withSlots(mods, format, curDay, curMod).map((m) => m.slot ? slotHtml(m, format) : modHtml(m, progress, nm, curIdx < 0 ? null : list.indexOf(m) - curIdx, format)).join("")}${mods.length ? endHtml(mods[mods.length - 1].t[1]) : ""}</div>`;
    $$("[data-day]", root).forEach((b) => (b.onclick = () => { curDay = +b.dataset.day; draw(); }));
    $$(".mod[data-id]", root).forEach((el) => {
      const head = $(".mhead", el), id = el.dataset.id;
      const toggle = () => { el.classList.toggle("open"); head.setAttribute("aria-expanded", el.classList.contains("open")); };
      head.addEventListener("click", (e) => { if (!e.target.closest(".check")) toggle(); });
      head.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".check")) { e.preventDefault(); toggle(); } });
      const flip = (e) => { e.stopPropagation(); progress.done = { ...(progress.done || {}), [id]: !progress.done?.[id] }; onChange(progress); draw(); };
      $(".check", el).addEventListener("click", flip);
      $(".check", el).addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), flip(e)));
      bindRefs(el);
      $$("[data-timer]", el).forEach((b) => (b.onclick = () => startTimer(+b.dataset.timer, b.dataset.tl || "Pratique")));
      $$("[data-startquiz]", el).forEach((b) => (b.onclick = () => renderQuiz(b.closest("[data-quiz]"), quizFor(format, b.dataset.startquiz), (s) => {
        progress.quiz = { ...(progress.quiz || {}), [b.dataset.startquiz]: Math.max(progress.quiz?.[b.dataset.startquiz] || 0, s) }; onChange(progress);
      })));
    });
  };
  draw();
  bindIdeas(root);
}

/* Pastilles d'aide (ateliers du jour 2 en niveau débutant, constructeur R·M·C·T·F) : une pastille touchée montre
   sa situation, une seule à la fois ; touchée de nouveau, elle se referme. */
export function ideasHtml() {
  return `<div class="ideas"><p class="small muted" style="margin:0 0 8px">${T("Touchez une pastille pour voir une situation, puis adaptez-la à votre service. Pour formuler le problème : « Chaque [fréquence], nous devons [tâche], ce qui prend [temps] parce que [difficulté]. »")}</p>
    ${IDEES.map((g, gi) => `<div class="ideas-g"><div class="ideas-h">${T(g.g)}</div><div class="chips">${g.items.map(([t], i) => `<button type="button" class="chip" data-idea="${gi}-${i}" aria-expanded="false">${T(t)}</button>`).join("")}</div></div>`).join("")}
    <div class="idea-out" hidden></div></div>`;
}
const ideasBound = new WeakSet(); // délégation posée une fois par conteneur (le parcours se redessine dans le même)
export function bindIdeas(root) {
  if (!root || ideasBound.has(root)) return;
  ideasBound.add(root);
  root.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-idea]"); if (!b) return;
    const box = b.closest(".ideas"), out = $(".idea-out", box), [gi, i] = b.dataset.idea.split("-").map(Number);
    const was = b.getAttribute("aria-expanded") === "true";
    $$("[data-idea]", box).forEach((x) => { x.setAttribute("aria-expanded", "false"); x.classList.remove("on"); });
    if (was || !IDEES[gi]?.items[i]) { out.hidden = true; return; }
    const [t, sit] = IDEES[gi].items[i];
    b.setAttribute("aria-expanded", "true"); b.classList.add("on");
    out.innerHTML = `<b>${T(t)}</b><p>${T(sit)}</p>`; out.hidden = false;
  });
}
/* Créneaux d'émargement dans le déroulé du stagiaire (session connue seulement), à leur heure :
   validés quand ils sont passés (30 min après l'heure prévue, jour passé), présentés par le formateur,
   ou dépassés par la séquence lancée ; « en cours » pendant le créneau. */
function withSlots(mods, session, day, curMod) {
  if (!session || typeof session !== "object" || !session.id) return mods;
  const toM = (t) => mins(t);
  const n = parisNow(), emarg = session.live?.emarg || {};
  const slots = emargementSlots(session).filter((x) => !x.kind && x.day === day).map((x) => {
    const past = (x.date && x.date < n.date) || (x.date === n.date && n.min >= toM(x.t) + 30)
      || !!emarg[x.key] || (curMod && (curMod.day || 1) === x.day && toM(curMod.t[0]) > toM(x.t));
    const open = !past && x.date === n.date && n.min >= toM(x.t) && n.min < toM(x.t) + 30;
    return { ...x, slot: true, past, open };
  });
  const out = [], rest = [...slots];
  mods.forEach((m) => { while (rest.length && toM(rest[0].t) <= toM(m.t[0])) out.push(rest.shift()); out.push(m); });
  return out.concat(rest);
}
function slotHtml(x, session) {
  const end = (() => { const v = mins(x.t) + 30; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; })();
  const tag = x.past ? `<span class="pill passed">✓ Validé</span>` : x.open ? `<a class="btn sm ok-btn" href="#/s/${session.id}/emargement">Émarger maintenant</a>` : `<span class="pill">À venir</span>`;
  return `<div class="mod em-slot${x.past ? " done passed" : ""}${x.open ? " now" : ""}" data-type="emargement" data-slot="${x.key}">
    <div class="time"><b>${hfr(x.t)}</b>${hfr(end)}</div>
    <div class="body"><div class="mhead"><span class="check" aria-hidden="true">${x.past ? "✓" : ""}</span><div class="meta"><span class="pill em">Émargement</span><b>${T(x.label)}</b>${tag}</div></div></div></div>`;
}

// Dernière ligne de chaque journée : l'heure de fin (modifiable par le formateur dans le pilotage)
const endHtml = (t) => `<div class="mod" data-type="fin"><div class="time"><b>${hfr(t)}</b></div><div class="body"><div class="mhead"><div class="meta"><span class="pill fin">Fin de la journée</span></div></div></div></div>`;
// rel : position par rapport à la séquence en cours (null si le formateur n'a rien lancé)
// session : la session (ou son seul format, pour les anciens appels), pour lire ses quiz et ses activités
function modHtml(m, progress, nm, rel = null, session = null) {
  const dur = mins(m.t[1]) - mins(m.t[0]);
  const isNow = rel === null ? nm >= mins(m.t[0]) && nm < mins(m.t[1]) : rel === 0;
  const passed = rel !== null && rel < 0; // séquence dépassée par le formateur : validée d'office
  const tag = rel === null || rel === 0 ? "" : rel > 0 ? `<span class="pill">À venir</span>` : `<span class="pill passed">✓ Validé</span>`;
  if (m.type === "pause") return `<div class="mod" data-type="pause"><div class="time"><b>${hfr(m.t[0])}</b></div><div class="body"><div class="mhead"><div class="meta"><span class="pill pause">${T(m.titre)}</span><span class="small muted">${fmtMin(dur)}</span></div></div></div></div>`;
  const done = !!progress.done?.[m.id] || passed;
  return `<div class="mod${done ? " done" : ""}${passed ? " passed" : ""}${isNow ? " now" : ""}${rel !== null && rel > 0 ? " later" : ""}" data-type="${m.type}" data-id="${m.id}">
    <div class="time"><b>${hfr(m.t[0])}</b>${hfr(m.t[1])}</div>
    <div class="body">
      <div class="mhead" role="button" tabindex="0" aria-expanded="false">
        <span class="check" role="checkbox" aria-checked="${done}" aria-label="Séquence terminée" tabindex="0">${done ? "✓" : ""}</span>
        <div style="flex:1">
          <div class="meta"><span class="pill ${m.type}">${typeLabel(m.type)}</span>${m.tf ? `<span class="pill tf">Temps fort ${m.tf}</span>` : ""}<span class="small muted">${fmtMin(dur)}${m.exo ? ` · dont ${m.exo.duree}${NB}min d'exercice` : ""}</span>${isNow ? `<span class="pill" style="background:var(--yel)">En ce moment</span>` : tag}</div>
          <h3>${T(m.titre)}</h3>
          ${m.cas || m.pages ? `<div class="mcas">${m.cas ? T(m.cas) : ""}${m.cas && m.pages ? ` <span class="muted">·</span> ` : ""}${m.pages ? `<span class="muted">p.${NB}${T(m.pages.replace(/ à /g, " – "))}</span>` : ""}</div>` : ""}
        </div>
        <span class="chev">▸</span>
      </div>
      <div class="mdetail">${detail(m, progress, session)}</div>
    </div></div>`;
}
function detail(m, progress, session = null) {
  let h = "";
  if (m.obj) h += `<div class="blk"><h4>Objectifs</h4><ul>${m.obj.map((x) => `<li>${T(x)}</li>`).join("")}</ul></div>`;
  if (m.pts) h += `<div class="blk"><h4>Ce qu'il faut retenir</h4><ul>${m.pts.map((x) => `<li>${T(x)}</li>`).join("")}</ul></div>`;
  if (m.ex) h += `<div class="blk"><h4>Exemples de rédactions</h4><ul class="small">${CASES.slice(0, 9).map((c) => `<li><b>${T(c[1])}</b> · ${T(c[2])} <span class="muted">(p.${NB}${c[3]})</span></li>`).join("")}</ul></div>`;
  if (m.exo) {
    h += `<div class="blk exo"><h4 style="color:var(--blue)">Temps de pratique · ${m.exo.duree}${NB}minutes</h4><h3>${T(m.exo.titre)}</h3><ol>${m.exo.steps.map((s) => `<li>${T(s)}</li>`).join("")}</ol>
      <div class="chips" style="margin-top:10px"><button class="btn sm" data-timer="${m.exo.duree}" data-tl="${esc(m.exo.titre)}">Lancer le minuteur (${m.exo.duree}${NB}min)</button>
      ${(m.exo.prompts || []).map((p) => { const P = PROMPTS.find((x) => x.id === p); return P ? `<button class="chip" data-prompt="${p}">Prompt : ${T(P.titre)}</button>` : ""; }).join("")}</div></div>`;
  }
  if (m.idees) h += `<div class="blk"><h4>Des idées pour démarrer</h4>${ideasHtml()}</div>`;
  if (m.disc) h += `<div class="blk disc"><h4 style="color:#7A5300">Discussion</h4><ul>${m.disc.map((x) => `<li>${T(x)}</li>`).join("")}</ul></div>`;
  const QZ = m.quiz ? quizFor(session, m.quiz) : null;
  if (QZ) h += `<div class="blk"><h4>Quiz · ${T(QZ.titre)}</h4><div data-quiz="${esc(m.quiz)}"><button class="btn sm ghost" data-startquiz="${esc(m.quiz)}">Faire le quiz (${QZ.questions.length} question${QZ.questions.length > 1 ? "s" : ""})${progress.quiz?.[m.quiz] != null ? ` · meilleur score ${progress.quiz[m.quiz]}/${QZ.questions.length}` : ""}</button></div></div>`;
  if (m.fiches) h += `<div class="blk"><h4>Dans le glossaire</h4><div class="chips">${m.fiches.map((f) => (ficheById(f) ? `<button class="chip" data-fiche="${f}">${T(ficheById(f).titre)}</button>` : "")).join("")}</div></div>`;
  // Activités en salle placées dans cette séquence (pilotage), sinon celle que cite le déroulé
  const PL = session?.activities ? actsByModule(session).get(m.id) || [] : [];
  const LV = !PL.length && m.live ? pollFor(session, m.live) : null;
  if (PL.length) h += `<p class="small muted" style="margin:0">${PL.length > 1 ? "Activités en salle" : "Activité en salle"} : ${PL.map((a) => `« ${T(a.titre)} »`).join(", ")}.</p>`;
  else if (LV) h += `<p class="small muted" style="margin:0">Activité en salle prévue : « ${T(LV.q)} ».</p>`;
  return h;
}
// Séquences déjà passées dans le déroulé piloté par le formateur
// Le cadrage (mode projet) n'existe que pour les formations de deux journées : en une journée, pas le temps
export const hasCadrage = (session) => daysOf(session).n > 1;

/* Outils d'exercice : ils apparaissent côté stagiaire quand le formateur lance (ou dépasse) la séquence
   qui les propose, puis restent disponibles. Après la session (close), tous restent accessibles. */
/* Activités placées dans le déroulé (quiz, sondages, nuages…). a.at : séquence choisie dans le pilotage
   ("" = hors déroulé, choix explicite). Sans a.at, ou si sa séquence n'existe plus : la séquence dont la ligne
   `activité:` cite l'activité (m.live), ou dont le quiz en autonomie (m.quiz) est celui de l'activité.
   Une activité n'est placée qu'à un seul endroit ; plusieurs activités d'une séquence gardent l'ordre de la liste. */
export function actPlace(session, a, mods = modulesFor(session)) {
  if (!a) return null;
  if (a.at === "") return null;
  if (a.at && mods.some((m) => m.id === a.at)) return a.at;
  const m = mods.find((x) => x.type !== "pause" && ((x.live && (x.live === a.id || x.live === a.from)) || (a.type === "quiz" && x.quiz && x.quiz === a.quiz)));
  return m ? m.id : null;
}
export function actsByModule(session) {
  const mods = modulesFor(session), map = new Map();
  for (const a of session?.activities || []) {
    const id = actPlace(session, a, mods);
    if (id) { if (!map.has(id)) map.set(id, []); map.get(id).push(a); }
  }
  return map;
}

export const TOOL_IDS = ["toolRmctf", "toolSve", "toolCc"];
export const TOOL_LABELS = { toolRmctf: "Constructeur R·M·C·T·F", toolSve: "Kit S·V·E", toolCc: "Jeu du code couleur" };
/* Outils visibles des stagiaires : ceux des séquences qui portent `outil`, une fois lancées ou dépassées dans le
   déroulé ; live.tools les garde ensuite (revenir en arrière ne les retire pas). Tous après la clôture. */
export function unlockedTools(session) {
  if (!session) return new Set();
  if (session.status === "closed") return new Set(TOOL_IDS);
  const mods = modulesFor(session), i = mods.findIndex((m) => m.id === session.live?.module);
  const reached = i < 0 ? [] : mods.slice(0, i + 1);
  return new Set([...(session.live?.tools || []), ...reached.map((m) => m.outil).filter(Boolean)].filter((t) => TOOL_IDS.includes(t)));
}

export function passedIds(format, currentId) {
  const all = modulesFor(format), i = all.findIndex((m) => m.id === currentId);
  return new Set(i < 0 ? [] : all.slice(0, i).map((m) => m.id));
}
export function parcoursPct(format, progress, currentId = null) {
  const passed = passedIds(format, currentId);
  progress = { ...progress, done: { ...(progress?.done || {}), ...Object.fromEntries([...passed].map((id) => [id, true])) } };
  const list = modulesFor(format).filter((m) => m.type !== "pause");
  const qz = [...new Set(list.filter((m) => m.quiz).map((m) => m.quiz))];
  const total = list.length + qz.length;
  const done = list.filter((m) => progress?.done?.[m.id]).length + qz.filter((q) => progress?.quiz?.[q] != null).length;
  return total ? Math.round((done / total) * 100) : 0;
}

/* ---------- Minuteur flottant ---------- */
let tmr = { left: 0, run: false, id: null };
export function startTimer(min, label) {
  if (!$("#timerBox")) {
    document.body.insertAdjacentHTML("beforeend", `<div id="timerBox"><span class="small" id="timerLbl"></span><span class="t" id="timerT">00:00</span><button id="timerPause">Pause</button><button id="timerStop" aria-label="Arrêter">✕</button></div>`);
    $("#timerPause").onclick = () => { tmr.run = !tmr.run; $("#timerPause").textContent = tmr.run ? "Pause" : "Reprendre"; };
    $("#timerStop").onclick = () => { clearInterval(tmr.id); $("#timerBox").classList.remove("on"); };
  }
  tmr.left = min * 60; tmr.run = true;
  $("#timerLbl").textContent = label.length > 40 ? label.slice(0, 38) + "…" : label;
  $("#timerBox").classList.add("on"); $("#timerPause").textContent = "Pause";
  const tick = () => {
    if (tmr.run && tmr.left > 0) tmr.left--;
    $("#timerT").textContent = tmr.left ? `${String(Math.floor(tmr.left / 60)).padStart(2, "0")}:${String(tmr.left % 60).padStart(2, "0")}` : "Terminé";
    if (!tmr.left) clearInterval(tmr.id);
  };
  tick(); clearInterval(tmr.id); tmr.id = setInterval(tick, 1000);
}

/* ---------- Outils d'exercice ---------- */
const TASK_MAX = 12;
const taskRow = (n, ph = "Tâche suivante, avec un verbe : « Classe… », « Vérifie… », « Propose… »") =>
  `<div class="task-row"><span class="task-n" aria-hidden="true">${n}</span><input type="text" data-task placeholder="${esc(ph)}" aria-label="Tâche ${n}"><button type="button" class="iconbtn" data-task-del aria-label="Retirer la tâche ${n}">×</button></div>`;
/* Prompt R·M·C·T·F : f = { R, M, C, T: [tâches], F }. Une tâche : « TÂCHE … » ; plusieurs : liste numérotée. */
export function rmctfPrompt(f, { doubt = false, inv = false } = {}) {
  const lab = { R: "RÔLE", M: "MISSION", C: "CONTEXTE", F: "FORMAT" };
  const tasks = (f.T || []).map((x) => String(x).trim()).filter(Boolean);
  const out = ["R", "M", "C"].filter((k) => f[k]).map((k) => `${lab[k]} ${f[k]}`);
  if (tasks.length === 1) out.push(`TÂCHE ${tasks[0]}`);
  else if (tasks.length > 1) out.push(`TÂCHES\n${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (f.F) out.push(`FORMAT ${f.F}`);
  if (doubt) out.push("Si tu ne sais pas, dis-le. N'invente ni chiffre, ni citation, ni source.");
  if (inv) out.push("Avant de répondre, pose-moi les questions dont tu as besoin pour faire ce travail.");
  return out.join("\n");
}
export function toolsHtml() {
  return `<div class="grid g2">
  <div class="card" id="toolRmctf">
    <h3>Constructeur R·M·C·T·F</h3>
    <p class="small muted" style="margin-top:0">Méthode d'initiation, pour une demande ponctuelle (p.${NB}101). Remplissez, puis copiez le prompt.</p>
    ${[["R", "Rôle · qui doit répondre ?", "Tu es secrétaire de rédaction d'une rédaction d'information."], ["M", "Mission · pour quoi faire ?", "Aider un·e journaliste à s'approprier un rapport avant une interview."], ["C", "Contexte · ce que l'IA ne peut pas deviner", "Public, source, date, contraintes. « Appuie-toi uniquement sur le texte fourni. »", 1], ["T", "Tâche · l'action précise, avec un verbe", "Extrais les 5 chiffres clés et signale ce qui est contestable."], ["F", "Format · la forme attendue", "5 puces de 25 mots maximum ; un tableau Chiffre | Ce qu'il mesure | Page."]]
      .map(([k, l, ph, ta]) => k === "T" ? `<label class="f"><span class="letter">T</span>${T("Tâches · une action par ligne, avec un verbe")}</label><div class="tasks" id="rTasks">${taskRow(1, ph)}</div><button type="button" class="btn sm ghost task-add" id="rTaskAdd">+ Ajouter une tâche</button>`
        : `<label class="f"><span class="letter">${k}</span>${T(l)}</label>${ta ? `<textarea data-k="${k}" placeholder="${esc(ph)}"></textarea>` : `<input type="text" data-k="${k}" placeholder="${esc(ph)}">`}`).join("")}
    <label class="f inline"><input type="checkbox" id="rDoubt" checked> Ajouter « Si tu ne sais pas, dis-le. N'invente ni chiffre, ni citation, ni source. »</label>
    <label class="f inline"><input type="checkbox" id="rInv"> Prompt inversé : « Avant de répondre, pose-moi les questions dont tu as besoin. »</label>
    <div class="prompt" id="rOut"></div>
    <div style="display:flex;gap:8px;align-items:center"><button class="btn sm" data-copy="rOut">Copier le prompt</button><span class="small muted" id="rCheck"></span></div>
    <details class="ideas-d"><summary class="small">Besoin d'idées ? Des situations pour démarrer</summary>${ideasHtml()}</details>
  </div>
  <div class="card" id="toolSve">
    <h3>Kit S·V·E pour un travail suivi</h3>
    <p class="small muted" style="margin-top:0">Spécification, vérification, environnement (p.${NB}104 à 109).</p>
    <label class="f">Votre sujet au long cours</label><input type="text" id="sveSubj" placeholder="La fermeture des maternités en région">
    <label class="f">Votre rédaction et votre support</label><input type="text" id="sveRed" placeholder="Rédaction web d'un quotidien national">
    <div class="subnav" id="sveNav"><button data-s="S" aria-pressed="true">S · Spec par interview</button><button data-s="V" aria-pressed="false">V · Critères d'abord</button><button data-s="E" aria-pressed="false">E · Instructions du projet</button><button data-s="N" aria-pressed="false">Note de décisions</button></div>
    <div class="prompt" id="sveOut"></div><button class="btn sm" data-copy="sveOut">Copier le prompt</button>
  </div>
  <div class="card" id="toolCc">
    <h3>Jeu : le code couleur de la rédaction</h3>
    <p class="small muted" style="margin-top:0">Pour chaque contenu : jamais, avec précaution ou sans risque dans un assistant grand public (p.${NB}97).</p>
    <div id="ccGame"></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px"><button class="btn sm" id="ccCheck">Vérifier mes réponses</button><button class="btn sm ghost" id="ccReset">Recommencer</button><span class="score" id="ccScore"></span></div>
  </div>
  <div class="card">
    <h3>Minuteur de pratique</h3>
    <p class="small muted" style="margin-top:0">Chaque exercice du parcours peut lancer son minuteur. Ou choisissez une durée.</p>
    <div class="chips">${[5, 10, 15, 20, 30, 45].map((n) => `<button class="chip" data-t="${n}">${n}${NB}min</button>`).join("")}</div>
  </div></div>`;
}
export function bindTools(root) {
  const card = $("#toolRmctf", root), list = $("#rTasks", root);
  const tasks = () => $$("[data-task]", list).map((i) => i.value.trim()).filter(Boolean);
  const v = (k) => (k === "T" ? tasks().join(" ") : $(`#toolRmctf [data-k="${k}"]`, root).value.trim());
  const rm = () => {
    const out = rmctfPrompt({ R: v("R"), M: v("M"), C: v("C"), T: tasks(), F: v("F") }, { doubt: $("#rDoubt", root).checked, inv: $("#rInv", root).checked });
    $("#rOut", root).textContent = out || "Le prompt apparaîtra ici.";
    const miss = ["R", "M", "C", "T", "F"].filter((k) => !v(k));
    $("#rCheck", root).textContent = miss.length ? fr("Manque : " + miss.join(", ")) : fr("Les cinq lettres y sont. Chaque lettre est-elle précise ?");
  };
  // Tâches : une par ligne. « Ajouter une tâche » ou Entrée ajoute une ligne, × la retire (il en reste toujours une).
  const renumber = () => {
    const rows = $$(".task-row", list);
    rows.forEach((r, i) => { $(".task-n", r).textContent = i + 1; $("[data-task]", r).setAttribute("aria-label", `Tâche ${i + 1}`); $("[data-task-del]", r).setAttribute("aria-label", `Retirer la tâche ${i + 1}`); $("[data-task-del]", r).hidden = rows.length < 2; });
    $("#rTaskAdd", root).disabled = rows.length >= TASK_MAX;
  };
  const addTask = (after) => {
    if ($$(".task-row", list).length >= TASK_MAX) return;
    const tmp = document.createElement("div"); tmp.innerHTML = taskRow(0);
    const row = tmp.firstElementChild;
    after ? after.after(row) : list.append(row);
    renumber(); $("[data-task]", row).focus(); rm();
  };
  $("#rTaskAdd", root).onclick = () => addTask(null);
  list.addEventListener("click", (e) => {
    const del = e.target.closest("[data-task-del]"); if (!del) return;
    const row = del.closest(".task-row"), prev = row.previousElementSibling || row.nextElementSibling;
    if ($$(".task-row", list).length < 2) return;
    row.remove(); renumber(); rm(); $("[data-task]", prev)?.focus();
  });
  list.addEventListener("keydown", (e) => {
    const inp = e.target.closest("[data-task]"); if (!inp) return;
    if (e.key === "Enter") { e.preventDefault(); addTask(inp.closest(".task-row")); }
    else if (e.key === "Backspace" && !inp.value && $$(".task-row", list).length > 1) { // ligne vide effacée : retour à la précédente
      e.preventDefault(); const row = inp.closest(".task-row"), prev = row.previousElementSibling || row.nextElementSibling;
      row.remove(); renumber(); rm(); const p = $("[data-task]", prev); p?.focus(); p?.setSelectionRange(p.value.length, p.value.length);
    }
  });
  card.addEventListener("input", rm); card.addEventListener("change", rm); // champs et lignes ajoutées ensuite
  renumber(); rm();
  bindIdeas(card);
  let tab = "S";
  const sv = () => {
    $$("#sveNav button", root).forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === tab));
    const s = $("#sveSubj", root).value.trim() || "[votre sujet]", r = $("#sveRed", root).value.trim() || "[votre rédaction et votre support]";
    const P = {
      S: `Je prépare un travail journalistique au long cours sur ${s}, pour ${r}. Avant de produire quoi que ce soit, interroge-moi, une question à la fois, pour établir :\n– la question éditoriale à laquelle ce travail doit répondre ;\n– le public et le support ;\n– ce qui rendrait ce travail raté ou inutile ;\n– les sources dont je dispose et celles qui manquent.\nQuand tu as assez d'éléments, rédige une spec d'une page, propose un découpage en lots courts et attends ma validation. Termine par la liste des hypothèses que tu as faites sans que je les aie énoncées.`,
      V: `Avant de produire le prochain livrable du dossier « ${s} », énonce des critères précis et vérifiables pour juger sa qualité. Par exemple : chaque chiffre renvoie à un document et à une page ; aucune question ne présuppose sa réponse ; les points contestés sont signalés comme tels. Attends que je valide ces critères.\n\nÀ la fin, évalue le livrable critère par critère : respecté, partiellement, non respecté, et pourquoi. Signale ce que tu n'as pas pu vérifier.`,
      E: `CONTEXTE Tu assistes un·e journaliste de ${r} sur le dossier « ${s} ». Spec du dossier : [coller la spec validée].\nSOURCES Les documents de ce projet sont tes seules sources. Pour chaque affirmation, cite le document et la page. Si l'information n'y figure pas, dis-le.\nTOUJOURS Distinguer faits sourcés, hypothèses et interprétations. Énoncer des critères de vérification avant toute production longue. Terminer par ce qui reste à vérifier.\nDEMANDER D'ABORD Avant tout changement d'angle ou de périmètre, et avant de recourir à une connaissance extérieure aux documents.\nJAMAIS Inventer une citation, un chiffre ou une source. Reformuler une citation entre guillemets. Traiter des données nominatives sur des personnes privées.`,
      N: `Rédige une note de décisions datée pour le dossier « ${s} » : ce qui a été validé, ce qui a été écarté et pourquoi, les hypothèses encore ouvertes, ce qui reste à vérifier. Format court, à ajouter aux documents du projet.\n\nÀ l'ouverture de la prochaine session : « Reprenons le dossier. Résume où nous en sommes, quels lots sont validés et ce qui reste à vérifier. »`,
    };
    $("#sveOut", root).textContent = fr(P[tab]);
  };
  $("#sveSubj", root).oninput = sv; $("#sveRed", root).oninput = sv;
  $$("#sveNav button", root).forEach((b) => (b.onclick = () => { tab = b.dataset.s; sv(); }));
  sv();
  const cc = () => {
    $("#ccGame", root).innerHTML = CC.map((c, i) => `<div class="ccitem" data-i="${i}"><div class="small">${T(c[0])}</div><div class="cc">${["jam", "pre", "san"].map((k) => `<button class="${k}" data-k="${k}">${CCL[k]}</button>`).join("")}</div></div>`).join("");
    $("#ccScore", root).textContent = "";
    $$("#ccGame .ccitem", root).forEach((it) => $$("button", it).forEach((b) => (b.onclick = () => { $$("button", it).forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); it.dataset.pick = b.dataset.k; it.querySelector(".fb")?.remove(); })));
  };
  cc();
  $("#ccReset", root).onclick = cc;
  $("#ccCheck", root).onclick = () => {
    let good = 0, n = 0;
    $$("#ccGame .ccitem", root).forEach((it) => {
      const ans = CC[+it.dataset.i][1]; it.querySelector(".fb")?.remove();
      if (!it.dataset.pick) return; n++;
      const ok = it.dataset.pick === ans; if (ok) good++;
      it.insertAdjacentHTML("beforeend", `<div class="fb small" style="margin-top:4px;color:${ok ? "var(--ok)" : "var(--ko)"}">${ok ? "Juste." : T("Réponse : " + CCL[ans] + ".")}</div>`);
    });
    $("#ccScore", root).textContent = n ? fr(`${good} sur ${n}`) : "Choisissez au moins une réponse.";
  };
  $$("[data-t]", root).forEach((b) => (b.onclick = () => startTimer(+b.dataset.t, "Pratique")));
  bindCopy(root);
}

/* ---------- Assistant : corpus, consigne, recherche locale ---------- */
export function corpus() {
  const mods = [...D1.map((m) => ({ fmt: "1 jour", ...m })), ...D2.map((m) => ({ fmt: "2 jours", ...m }))].filter((m) => m.type !== "pause");
  return [
    "== DÉROULÉ ==", ...mods.map((m) => `[${m.fmt}${m.day ? " · jour " + m.day : ""}] ${m.t[0]}-${m.t[1]} ${typeLabel(m.type)}${m.tf ? " · temps fort " + m.tf : ""} : ${m.titre}${m.cas ? " (exemple : " + m.cas + ")" : ""}${m.pages ? " (pages " + m.pages + ")" : ""}${m.exo ? " · exercice " + m.exo.duree + " min : " + m.exo.steps.join(" / ") : ""}`),
    "== FICHES (citer avec [[fiche:id]]) ==", ...FICHES.map((f) => `[[fiche:${f.id}]] ${f.titre} — ${f.resume} ${f.sections.map(([h, c]) => h + " : " + (Array.isArray(c) ? c.join(" ; ") : c)).join(" | ")} ${f.warn ? "À retenir : " + f.warn : ""} (pages ${f.pages})`),
    "== GLOSSAIRE ==", ...GLOSS.map((g) => `${g[0]} : ${g[1]} (p. ${g[3]})${g[2] ? " → [[fiche:" + g[2] + "]]" : ""}`),
    "== PROMPTS (citer avec [[prompt:id]]) ==", ...PROMPTS.map((p) => `[[prompt:${p.id}]] ${p.titre} (${p.tag}, p. ${p.page})`),
    "== EXEMPLES DE RÉDACTIONS ==", ...CASES.map((c) => `${c[0]} · ${c[1]} : ${c[2]} (p. ${c[3]})`),
  ].join("\n");
}
export const SYS = `Tu es l'assistant d'apprentissage d'une formation de journalistes à l'IA générative (« Prendre en main les IA génératives »). Réponds en français, en trois à six phrases, sans flatterie. Appuie-toi uniquement sur le CORPUS. Si la réponse n'y figure pas, dis-le en une phrase et indique la ressource la plus proche. Termine par une ou deux références sous la forme [[fiche:id]] ou [[prompt:id]], et cite les pages du support quand le corpus les donne. Ne donne jamais de conseil juridique personnalisé ; renvoie à la charte IA de la rédaction pour les cas sensibles.`;

// Version Markdown des ressources, à coller dans son propre assistant
export function corpusMarkdown() {
  return [
    "# Ressources · Prendre en main les IA génératives", "",
    "## Fiches pratiques", ...FICHES.flatMap((f) => [`### ${f.titre}`, f.resume, ...f.sections.map(([h, c]) => `**${h}** — ${Array.isArray(c) ? c.join(" ; ") : c}`), f.warn ? `> ${f.warn}` : "", ""]),
    "## Glossaire", ...GLOSS.map((g) => `- **${g[0]}** : ${g[1]}`), "",
    "## Prompts", ...PROMPTS.flatMap((p) => [`### ${p.titre} (${p.tag})`, "```", p.txt, "```", ""]),
  ].join("\n");
}

export function linkify(txt) {
  return T(txt).replace(/\[\[(fiche|prompt):([a-z0-9-]+)\]\]/g, (m, k, id) => {
    if (k === "fiche") { const f = ficheById(id); return f ? `<a href="#" class="ref" data-fiche="${id}">Fiche : ${esc(f.titre)}</a>` : ""; }
    const p = PROMPTS.find((x) => x.id === id); return p ? `<a href="#" class="ref" data-prompt="${id}">Prompt : ${esc(p.titre)}</a>` : "";
  });
}
export function localSearch(q) {
  const words = norm(q).split(/[^a-z0-9·]+/).filter((w) => w.length > 2);
  const score = (s) => { const n = norm(s); return words.reduce((a, w) => a + (n.includes(w) ? 1 : 0), 0); };
  const R = [
    ...FICHES.map((f) => ({ s: score(f.titre + " " + f.resume + " " + JSON.stringify(f.sections)) + score(f.titre) * 2, h: `<a href="#" class="ref" data-fiche="${f.id}">Fiche : ${esc(f.titre)}</a> ${T(f.resume)}` })),
    ...GLOSS.map((g) => ({ s: score(g[0] + " " + g[1]) + score(g[0]) * 2, h: `<b>${T(g[0])}</b> · ${T(g[1])}` })),
    ...PROMPTS.map((p) => ({ s: score(p.titre + " " + p.tag), h: `<a href="#" class="ref" data-prompt="${p.id}">Prompt : ${esc(p.titre)}</a>` })),
  ].filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  return R.length ? "Voici les ressources les plus proches de votre question :\n" + R.map((r) => "• " + r.h).join("\n") : "Je ne trouve rien qui corresponde. Essayez un autre mot, ou parcourez les fiches pratiques.";
}
