/* Activités du jour J : définitions par défaut, saisie côté stagiaire,
   affichage des résultats (écran projeté, back-office, stagiaires). */
import { PRESETS, QUIZ } from "../data.js";
import { T, esc, norm, $, $$ } from "./dom.js";

export const ACT_TYPES = {
  welcome: "Accueil", cloud: "Nuage de mots", poll: "Sondage", quiz: "Quiz", vote: "Vote", projects: "Projets",
};

const P = (id, titre) => ({ id, titre, type: PRESETS[id].type, q: PRESETS[id].q, ...(PRESETS[id].o ? { o: PRESETS[id].o } : {}) });

// Séquence proposée à la création d'une session (modifiable ensuite)
export function defaultActivities(format = "1") {
  const base = [
    { id: "accueil", type: "welcome", titre: "Accueil" },
    P("attente", "Nuage de mots"),
    P("niveau", "Sondage d'entrée"),
    { id: "quiz-llm", type: "quiz", titre: "Quiz · la machine", quiz: "llm" },
    { id: "quiz-redac", type: "quiz", titre: "Quiz · les rédactions", quiz: "redac" },
    P("carnet", "Point d'étape Notebook"),
    P("invente", "Notebook a-t-il inventé ?"),
    { id: "quiz-rmctf", type: "quiz", titre: "Quiz · R·M·C·T·F", quiz: "rmctf" },
    P("lettre", "La lettre oubliée"),
    { id: "vote", type: "vote", titre: "Vote", q: "Quel cas d'usage voulez-vous voir testé devant le groupe ?" },
    { id: "projets", type: "projects", titre: "Projets" },
    { id: "quiz-sve", type: "quiz", titre: "Quiz · S·V·E", quiz: "sve" },
    P("lundi", "Lundi matin"),
  ];
  // vote et présentation des projets reposent sur le cadrage, réservé aux formations de deux journées
  if (format !== "2") return base.filter((a) => !["vote", "projects"].includes(a.type));
  base.splice(9, 0, { id: "quiz-jargon", type: "quiz", titre: "Quiz · le jargon", quiz: "jargon" }, { id: "quiz-donnees", type: "quiz", titre: "Quiz · vos données", quiz: "donnees" });
  return base;
}

// Clé de réponse : une par question pour les quiz
export const respKey = (act, live) => (act.type === "quiz" ? `${act.id}#${live.qi || 0}` : act.id);

// Question courante d'un quiz : [énoncé, options, bonne réponse, explication]
export const quizQ = (act, live) => QUIZ[act.quiz]?.q[live.qi || 0];

// Activité en cours : seulement quand l'écran est en mode « activité »
export const currentAct = (session) => {
  const l = session?.live || {};
  if (!l.act || (l.view && l.view !== "activity")) return null;
  return session.activities.find((a) => a.id === l.act) || null;
};

/* ---------- Saisie stagiaire ---------- */
// Rend le formulaire de réponse ; onAnswer(value) est appelé à chaque envoi.
export function renderInput(box, act, live, mine, onAnswer) {
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
    const Q = quizQ(act, live); if (!Q) { box.innerHTML = ""; return; }
    q = Q[0]; opts = Q[1]; good = Q[2]; expl = Q[3]; reveal = !!live.reveal;
  } else if (act.type === "vote") {
    q = act.q; opts = (live.options || act.options || []).map((o) => o.titre + (o.auteur ? ` · ${o.auteur}` : ""));
    if (!opts.length) { box.innerHTML = `<h3>${T(q)}</h3><p class="empty">Aucun projet validé pour l'instant.</p>`; return; }
  } else { q = act.q; opts = act.o || []; }
  const head = act.type === "quiz" ? `<div class="small muted">${T(QUIZ[act.quiz].titre)} · question ${(live.qi || 0) + 1} sur ${QUIZ[act.quiz].q.length}</div>` : "";
  box.innerHTML = `${head}<h3>${T(q)}</h3>${opts.map((o, i) => {
    let cls = mine === i ? " sel" : "";
    if (reveal) cls = i === good ? " ok" : mine === i ? " ko" : "";
    return `<button class="opt${cls}" data-i="${i}" ${reveal ? "disabled" : ""}>${T(o)}</button>`;
  }).join("")}${reveal ? `<div class="expl">${T(expl)}</div>` : mine !== undefined ? `<p class="small muted">Réponse envoyée. Vous pouvez changer d'avis tant que l'activité est ouverte.</p>` : ""}`;
  if (!reveal) $$(".opt", box).forEach((b) => (b.onclick = () => onAnswer(+b.dataset.i)));
}

/* ---------- Résultats ---------- */
export function countOf(rows) { return rows.reduce((a, r) => a + r.n, 0); }

export function renderResults(act, live, rows, big = false) {
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
  if (act.type === "quiz") { const Q = quizQ(act, live); if (!Q) return ""; opts = Q[1]; if (live.reveal) good = Q[2]; }
  else if (act.type === "vote") opts = (live.options || act.options || []).map((o) => o.titre);
  else opts = act.o || [];
  if (!total) return `<div class="waiting">En attente des premières réponses…</div>`;
  const c = opts.map((_, i) => rows.filter((r) => r.value === i).reduce((a, r) => a + r.n, 0));
  const mx = Math.max(1, ...c);
  return `<div class="bars${big ? " big" : ""}">${opts.map((o, i) => `<div class="row${i === good ? " good" : ""}"><span>${T(o)}</span><span class="track"><i style="width:${(c[i] / mx) * 100}%"></i></span><b>${c[i]}</b></div>`).join("")}</div>`;
}

export function actQuestion(act, live) {
  if (!act) return "";
  if (act.type === "quiz") return quizQ(act, live)?.[0] || "";
  if (act.type === "welcome") return "Bienvenue";
  if (act.type === "projects") return "Les projets du groupe";
  return act.q || act.titre;
}
