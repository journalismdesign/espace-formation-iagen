/* Appliquer un déroulé (conducteur .md importé ou trame) à une session, et l'inverse (pur, testé dans
   tests/trame.test.mjs).
   - applyPatch : la mise à jour à envoyer pour la session. Le déroulé remplace celui de la session (les heures de
     fin modifiées dans le Jour J restent), le format suit le nombre de journées, chaque quiz ou sondage joué en salle
     (acts, ou live) est ajouté aux activités s'il manque puis placé dans sa séquence, les quiz sont copiés depuis la
     bibliothèque, la séquence lancée disparue est oubliée, et le lien du support peut suivre la trame.
   - trameFromSession : le déroulé d'une session, prêt à enregistrer comme trame (activités placées comprises). */
import { pollActivity, quizKeysOf, snapshotQuizzes } from "./quizzes.js";
import { modulesFor, daysOf, actsByModule } from "./content.js";

const keyOf = (a) => (a.type === "quiz" ? a.quiz : a.from || a.id); // clé de bibliothèque d'une activité de la session

export function applyPatch(session, programme, bank = { ready: false, items: [] }, { slides = false } = {}) {
  const modules = programme.modules || [], ids = new Set(modules.map((m) => m.id));
  const patch = { programme: session.programme?.ends ? { ...programme, ends: session.programme.ends } : programme, format: String(programme.nDays || 1) };
  let acts = (session.activities || []).map((a) => ({ ...a })), touched = false;
  const freeId = (base) => { let id = base, n = 2; while (acts.some((a) => a.id === id)) id = `${base}-${n++}`; return id; };
  for (const m of modules) {
    for (const k of m.acts || (m.live ? [m.live] : [])) {
      let a = acts.find((x) => x.id === k || keyOf(x) === k);
      if (!a) {
        const it = (bank.items || []).find((b) => b.id === k);
        if (it && it.kind !== "quiz") a = pollActivity(it, freeId(it.id));
        else if (it || session.quizzes?.[k]) a = { id: freeId(`quiz-${k}`), type: "quiz", titre: it?.titre || session.quizzes[k].titre, quiz: k };
        else continue;
        acts.push(a); touched = true;
      }
      if (!a.at || !ids.has(a.at)) { a.at = m.id; touched = true; } // placée dans sa séquence (une seule place par activité)
    }
  }
  if (touched) patch.activities = acts;
  if (bank.ready) patch.quizzes = snapshotQuizzes(session.quizzes, quizKeysOf(acts, modules), bank.items);
  if (session.live?.module && !ids.has(session.live.module)) patch.live = { ...session.live, module: null };
  if (slides && programme.slides_url) patch.slides_url = programme.slides_url;
  return patch;
}

export function trameFromSession(session) {
  const mods = modulesFor(session), D = daysOf(session), placed = actsByModule(session);
  const modules = mods.map(({ ...m }) => {
    const keys = (placed.get(m.id) || []).filter((a) => a.type !== "welcome" && a.type !== "projects").map(keyOf).filter(Boolean);
    delete m.live; delete m.acts;
    return keys.length ? { ...m, live: keys[0], ...(keys.length > 1 ? { acts: keys } : {}) } : m;
  });
  return { formation: session.programme?.formation || session.formation || "", days: D.titles || {}, nDays: D.n, modules,
    ...(session.slides_url ? { slides_url: session.slides_url } : {}) };
}
