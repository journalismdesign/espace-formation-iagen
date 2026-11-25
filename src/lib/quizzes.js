/* Quiz et sondages : où les trouver, comment les contrôler.
   - Bibliothèque (table quiz_bank) : modèles partagés, modifiés par l'administration.
     { id, kind: "quiz" | "poll" | "cloud", titre, content, updated_at }
     content d'un quiz : { questions: [{ id, q, o: [...], ok, why }] } · d'un sondage : { q, o: [...] } · d'un nuage : { q }
   - Session : copie figée des quiz qu'elle utilise (sessions.quizzes, par clé), et sondages ou nuages dans
     sessions.activities. Modifier la bibliothèque ne change jamais une session déjà créée.
   - Secours : data.js, pour les sessions créées avant la bibliothèque, tant que la migration n'est pas
     exécutée, et pour le mode démo.
   Les questions reprises de data.js gardent leur rang comme identifiant ("0", "1"…) : les clés de réponse
   restent celles d'avant (quiz-llm#0). Une question créée dans l'éditeur reçoit un identifiant aléatoire.
   Module pur (pas de DOM) : importé par les tests. */
import { QUIZ, PRESETS } from "../data.js";

export const KINDS = { quiz: "Quiz", poll: "Sondage", cloud: "Nuage de mots" };
export const LIMITS = { titre: 80, q: 300, o: 160, why: 600, questions: 30, quizOpts: [2, 6], pollOpts: [2, 8] };
// Titres des sondages et nuages repris de data.js
export const PRESET_TITLES = {
  niveau: "Sondage d'entrée", attente: "Vos attentes", carnet: "Point d'étape Notebook", invente: "Notebook a-t-il inventé ?",
  lettre: "La lettre oubliée", fini: "Où en est l'exercice ?", ia: "L'IA en un mot", lundi: "Lundi matin",
};
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const QID_RE = /^[\w-]{1,24}$/;

const rand = (n) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
export const newQid = () => "q-" + rand(6);
// Identifiant d'un élément de la bibliothèque ou d'un quiz propre à une session, lisible et unique
export function newItemId(titre = "", prefix = "") {
  const slug = String(titre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 26);
  return `${prefix}${slug || "element"}-${rand(4)}`.replace(/^-+/, "").slice(0, 40);
}

/* ---------- Lecture ---------- */
// Quiz de data.js au format de la bibliothèque
export function legacyQuiz(key) {
  const Q = Object.prototype.hasOwnProperty.call(QUIZ, key) ? QUIZ[key] : null;
  return Q ? { titre: Q.titre, questions: Q.q.map(([q, o, ok, why], i) => ({ id: String(i), q, o: [...o], ok, why: why || "" })) } : null;
}
// Bibliothèque de secours : le contenu de data.js, sous la forme des lignes de quiz_bank
export function bankFromData() {
  return [
    ...Object.keys(QUIZ).map((id) => ({ id, kind: "quiz", titre: QUIZ[id].titre, content: { questions: legacyQuiz(id).questions } })),
    ...Object.entries(PRESETS).map(([id, p]) => ({ id, kind: p.type, titre: PRESET_TITLES[id] || p.q.slice(0, 40), content: p.type === "poll" ? { q: p.q, o: [...p.o] } : { q: p.q } })),
  ];
}
// Quiz d'une session : sa copie, sinon data.js (anciennes sessions), sinon null (jamais de plantage)
export function quizFor(session, key) {
  if (!key) return null;
  const own = session && typeof session === "object" ? session.quizzes?.[key] : null;
  return own?.questions?.length ? own : legacyQuiz(key);
}
// Question en cours d'un quiz lancé : { id, q, o, ok, why } ou null
export const quizQ = (act, live, session) => quizFor(session, act?.quiz)?.questions?.[live?.qi || 0] || null;
// Clé de réponse : une par question pour les quiz (identifiant stable de la question)
export const respKey = (act, live, session) => (act.type === "quiz" ? `${act.id}#${quizQ(act, live, session)?.id ?? (live?.qi || 0)}` : act.id);
// Toutes les clés de réponse d'une activité (pour savoir si elle a déjà reçu des réponses)
export const respKeys = (act, session) => (act.type === "quiz" ? (quizFor(session, act.quiz)?.questions || []).map((q) => `${act.id}#${q.id}`) : [act.id]);
// Sondage ou nuage prévu dans une séquence (ligne « activité: » du conducteur) : l'activité de la session, sinon data.js
export function pollFor(session, key) {
  const a = session && typeof session === "object" ? (session.activities || []).find((x) => x.id === key || x.from === key) : null;
  if (a?.q) return a;
  return Object.prototype.hasOwnProperty.call(PRESETS, key) ? PRESETS[key] : null;
}

/* ---------- Copies dans la session ---------- */
// Clés des quiz dont une session a besoin : activités, puis séquences du déroulé (quiz en autonomie)
export const quizKeysOf = (activities = [], modules = []) =>
  [...new Set([...activities.filter((a) => a.type === "quiz" && a.quiz).map((a) => a.quiz), ...modules.filter((m) => m.quiz).map((m) => m.quiz)])];
// Copie d'un élément de bibliothèque pour une session
export const copyOf = (item) => ({ titre: item.titre, questions: item.content.questions.map((q) => ({ ...q, o: [...q.o] })), from: item.id });
// Ajoute les quiz manquants (depuis la bibliothèque, sinon data.js) sans toucher à ceux déjà copiés
export function snapshotQuizzes(existing = {}, keys = [], bank = []) {
  const out = { ...(existing || {}) };
  for (const k of keys) {
    if (out[k]?.questions?.length) continue;
    const item = bank.find((b) => b.id === k && b.kind === "quiz");
    if (item?.content?.questions?.length) out[k] = copyOf(item);
    else { const L = legacyQuiz(k); if (L) out[k] = { ...L, from: k }; }
  }
  return out;
}
// Sondage ou nuage de la bibliothèque devenu activité de session
export const pollActivity = (item, id = item.id) => ({ id, type: item.kind, titre: item.titre, q: item.content.q, ...(item.kind === "poll" ? { o: [...item.content.o] } : {}), from: item.id });
// La bibliothèque a-t-elle une version différente de la copie de la session ?
const sameQuestions = (a = [], b = []) => JSON.stringify(a.map(({ id, q, o, ok, why }) => [id, q, o, ok, why || ""])) === JSON.stringify(b.map(({ id, q, o, ok, why }) => [id, q, o, ok, why || ""]));
export function outdated(copyOrAct, item) {
  if (!item || !copyOrAct) return false;
  if (item.kind === "quiz") return copyOrAct.titre !== item.titre || !sameQuestions(copyOrAct.questions, item.content.questions);
  return copyOrAct.q !== item.content.q || JSON.stringify(copyOrAct.o || []) !== JSON.stringify(item.content.o || []);
}

/* ---------- Contrôle et nettoyage (éditeur, avant tout enregistrement) ---------- */
const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// raw : { titre, questions: [{ id?, q, o: [...], ok, why }] } (ok : rang dans o, réponses vides comprises)
export function cleanQuiz(raw) {
  const errors = [], seen = new Set();
  const titre = str(raw?.titre, LIMITS.titre);
  if (!titre) errors.push("Donnez un titre au quiz.");
  const list = Array.isArray(raw?.questions) ? raw.questions : [];
  if (!list.length) errors.push("Ajoutez au moins une question.");
  if (list.length > LIMITS.questions) errors.push(`${LIMITS.questions} questions au plus.`);
  const questions = list.slice(0, LIMITS.questions).map((x, i) => {
    const n = `Question ${i + 1} : `;
    const q = str(x?.q, LIMITS.q);
    if (!q) errors.push(n + "l'énoncé est vide.");
    const rawO = Array.isArray(x?.o) ? x.o : [];
    const kept = rawO.map((o, j) => [str(o, LIMITS.o), j]).filter(([o]) => o);
    const o = kept.map(([t]) => t);
    if (o.length < LIMITS.quizOpts[0]) errors.push(n + "au moins deux réponses.");
    if (o.length > LIMITS.quizOpts[1]) errors.push(n + `${LIMITS.quizOpts[1]} réponses au plus.`);
    const ok = kept.findIndex(([, j]) => j === Number(x?.ok));
    if (o.length >= 2 && ok < 0) errors.push(n + "choisissez la bonne réponse.");
    let id = QID_RE.test(String(x?.id || "")) ? String(x.id) : newQid();
    while (seen.has(id)) id = newQid();
    seen.add(id);
    return { id, q, o: o.slice(0, LIMITS.quizOpts[1]), ok, why: str(x?.why, LIMITS.why) };
  });
  return { value: { titre, questions }, errors };
}
// raw : { titre, q, o: [...] } ; kind : "poll" ou "cloud"
export function cleanPoll(raw, kind) {
  const errors = [];
  const titre = str(raw?.titre, LIMITS.titre), q = str(raw?.q, LIMITS.q);
  if (!titre) errors.push("Donnez un titre court.");
  if (!q) errors.push("La question est vide.");
  const value = { titre, q };
  if (kind === "poll") {
    value.o = (Array.isArray(raw?.o) ? raw.o : []).map((o) => str(o, LIMITS.o)).filter(Boolean);
    if (value.o.length < LIMITS.pollOpts[0]) errors.push("Au moins deux réponses.");
    if (value.o.length > LIMITS.pollOpts[1]) { errors.push(`${LIMITS.pollOpts[1]} réponses au plus.`); value.o = value.o.slice(0, LIMITS.pollOpts[1]); }
  }
  return { value, errors };
}
