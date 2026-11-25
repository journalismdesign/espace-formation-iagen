/* Activités du jour J : définitions par défaut, saisie côté stagiaire,
   affichage des résultats (écran projeté, back-office, stagiaires). */
import { PRESETS } from "../data.js";
import { T, esc, norm, $, $$ } from "./dom.js";
import { quizFor, quizQ, respKey, pollActivity, PRESET_TITLES } from "./quizzes.js";
export { quizQ, respKey };

export const ACT_TYPES = {
  welcome: "Accueil", cloud: "Nuage de mots", poll: "Sondage", quiz: "Quiz", vote: "Vote", projects: "Projets",
};

// Sondage ou nuage proposé par défaut : la version de la bibliothèque, sinon celle de data.js
const preset = (bank) => (id) => {
  const item = (bank || []).find((b) => b.id === id && (b.kind === "poll" || b.kind === "cloud"));
  if (item) return pollActivity(item, id);
  const p = PRESETS[id];
  return { id, titre: PRESET_TITLES[id] || p.q.slice(0, 40), type: p.type, q: p.q, ...(p.o ? { o: [...p.o] } : {}), from: id };
};

// Séquence proposée à la création d'une session (modifiable ensuite). bank : éléments de la bibliothèque
export function defaultActivities(format = "1", bank = null) {
  const P = preset(bank);
  const base = [
    { id: "accueil", type: "welcome", titre: "Accueil" },
    P("attente"),
    P("niveau"),
    { id: "quiz-llm", type: "quiz", titre: "Quiz · la machine", quiz: "llm" },
    { id: "quiz-redac", type: "quiz", titre: "Quiz · les rédactions", quiz: "redac" },
    P("carnet"),
    P("invente"),
    { id: "quiz-rmctf", type: "quiz", titre: "Quiz · R·M·C·T·F", quiz: "rmctf" },
    P("lettre"),
    { id: "vote", type: "vote", titre: "Vote", q: "Quel cas d'usage voulez-vous voir testé devant le groupe ?" },
    { id: "projets", type: "projects", titre: "Projets" },
    { id: "quiz-sve", type: "quiz", titre: "Quiz · S·V·E", quiz: "sve" },
    P("lundi"),
  ];
  // vote et présentation des projets reposent sur le cadrage, réservé aux formations de deux journées
  if (format !== "2") return base.filter((a) => !["vote", "projects"].includes(a.type));
  base.splice(9, 0, { id: "quiz-jargon", type: "quiz", titre: "Quiz · le jargon", quiz: "jargon" }, { id: "quiz-donnees", type: "quiz", titre: "Quiz · vos données", quiz: "donnees" });
  return base;
}

// Clé de réponse et question en cours d'un quiz : voir quizzes.js (identifiants de question stables)

// Activité en cours : seulement quand l'écran est en mode « activité »
export const currentAct = (session) => {
  const l = session?.live || {};
  if (!l.act || (l.view && l.view !== "activity")) return null;
  return session.activities.find((a) => a.id === l.act) || null;
};

/* ---------- Saisie stagiaire ---------- */
// Rend le formulaire de réponse ; onAnswer(value) est appelé à chaque envoi. session : pour lire ses quiz
export function renderInput(box, act, live, mine, onAnswer, session = null) {
  if (act.type === "welcome") {
    box.innerHTML = `<h3>Bienvenue</h3><p class="muted">La formation va commencer. Gardez cette page ouverte : les sondages, nuages de mots et quiz s'afficheront ici.</p>`;
    return;
  }
  if (act.type === "projects") {
    box.innerHTML = `<h3>Les projets du groupe</h3><p class="muted">Regardez l'écran projeté : le formateur présente les cas d'usage cadrés avant la formation.</p>`;
    return;
  }
  if (act.type === "cloud") {
    const words = Array.isArray(mine) ? mine : [];
    box.innerHTML = `<h3>${T(act.q)}</h3><p class="small muted">Jusqu'à trois mots ou expressions courtes.</p>
      <form class="askrow" data-f><input type="text" maxlength="30" placeholder="Un mot" aria-label="Votre mot"><button class="btn" type="submit">Envoyer</button></form>
      <div class="chips" style="margin-top:8px">${words.map((w, i) => `<button class="chip" data-del="${i}" title="Retirer">${esc(w)} ✕</button>`).join("")}</div>`;
    $("[data-f]", box).onsubmit = (e) => {
      e.preventDefault();
      const inp = $("input", box), w = inp.value.trim().slice(0, 30);
      if (!w) return;
      onAnswer([...words.filter((x) => norm(x) !== norm(w)), w].slice(-3));
    };
    $$("[data-del]", box).forEach((b) => (b.onclick = () => onAnswer(words.filter((_, i) => i !== +b.dataset.del))));
    return;
  }
  let q, opts, reveal = false, good = -1, expl = "";
  if (act.type === "quiz") {
    const Q = quizQ(act, live, session); if (!Q) { box.innerHTML = ""; return; }
    q = Q.q; opts = Q.o; good = Q.ok; expl = Q.why; reveal = !!live.reveal;
  } else if (act.type === "vote") {
    q = act.q; opts = (live.options || act.options || []).map((o) => o.titre + (o.auteur ? ` · ${o.auteur}` : ""));
    if (!opts.length) { box.innerHTML = `<h3>${T(q)}</h3><p class="empty">Aucun projet validé pour l'instant.</p>`; return; }
  } else { q = act.q; opts = act.o || []; }
  const QZ = act.type === "quiz" ? quizFor(session, act.quiz) : null;
  const head = QZ ? `<div class="small muted">${T(QZ.titre)} · question ${(live.qi || 0) + 1} sur ${QZ.questions.length}</div>` : "";
  box.innerHTML = `${head}<h3>${T(q)}</h3>${opts.map((o, i) => {
    let cls = mine === i ? " sel" : "";
    if (reveal) cls = i === good ? " ok" : mine === i ? " ko" : "";
    return `<button class="opt${cls}" data-i="${i}" ${reveal ? "disabled" : ""}>${T(o)}</button>`;
  }).join("")}${reveal ? (expl ? `<div class="expl">${T(expl)}</div>` : "") : mine !== undefined ? `<p class="small muted">Réponse envoyée. Vous pouvez changer d'avis tant que l'activité est ouverte.</p>` : ""}`;
  if (!reveal) $$(".opt", box).forEach((b) => (b.onclick = () => onAnswer(+b.dataset.i)));
}

/* ---------- Résultats ---------- */
export function countOf(rows) { return rows.reduce((a, r) => a + r.n, 0); }

export function renderResults(act, live, rows, big = false, session = null) {
  if (!act) return `<p class="empty">Aucune activité en cours.</p>`;
  const total = countOf(rows);
  if (act.type === "welcome" || act.type === "projects") return "";
  if (act.type === "cloud") {
    const f = {};
    rows.forEach((r) => (Array.isArray(r.value) ? r.value : [r.value]).forEach((w) => {
      const k = norm(String(w)).trim(); if (!k) return;
      f[k] = f[k] || { w: String(w), n: 0 }; f[k].n += r.n;
    }));
    const L = Object.values(f).sort((a, b) => b.n - a.n);
    if (!L.length) return `<div class="waiting">En attente des premiers mots…</div>`;
    const mx = L[0].n;
    return `<div class="cloud${big ? " big" : ""}">${L.map((x) => `<span style="font-size:${(big ? 20 : 14) + (x.n / mx) * (big ? 54 : 20)}px">${esc(x.w)}</span>`).join("")}</div>`;
  }
  let opts, good = -1;
  if (act.type === "quiz") { const Q = quizQ(act, live, session); if (!Q) return ""; opts = Q.o; if (live.reveal) good = Q.ok; }
  else if (act.type === "vote") opts = (live.options || act.options || []).map((o) => o.titre);
  else opts = act.o || [];
  if (!total) return `<div class="waiting">En attente des premières réponses…</div>`;
  const c = opts.map((_, i) => rows.filter((r) => r.value === i).reduce((a, r) => a + r.n, 0));
  const mx = Math.max(1, ...c);
  return `<div class="bars${big ? " big" : ""}">${opts.map((o, i) => `<div class="row${i === good ? " good" : ""}"><span>${T(o)}</span><span class="track"><i style="width:${(c[i] / mx) * 100}%"></i></span><b>${c[i]}</b></div>`).join("")}</div>`;
}

export function actQuestion(act, live, session = null) {
  if (!act) return "";
  if (act.type === "quiz") return quizQ(act, live, session)?.q || "";
  if (act.type === "welcome") return "Bienvenue";
  if (act.type === "projects") return "Les projets du groupe";
  return act.q || act.titre;
}
