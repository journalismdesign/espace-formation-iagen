// Modèle de l'éditeur de trames (src/lib/trame.js)
import { D1, D2 } from "../src/data.js";
import { parsePages } from "../src/deck.js";
import { applyPatch, trameFromSession } from "../src/lib/applyProgramme.js";
import { bankFromData } from "../src/lib/quizzes.js";
import { defaultActivities } from "../src/lib/activities.js";
import { fromProgramme, toProgramme, timeline, moveItem, addItem, updateItem, removeItem, duplicateItem, updateDay, addDay, removeDay, find, pagesUsage, trameKeys, blankTrame, MAX_DAYS, toMin } from "../src/lib/trame.js";

const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const prog = (mods, extra = {}) => ({ formation: "Test", days: {}, nDays: Math.max(1, ...mods.map((m) => m.day || 1)), modules: mods, ...extra });
const same = (a, b) => a.length === b.length && a.every((m, i) => m.id === b[i].id && m.t.join() === b[i].t.join() && m.titre === b[i].titre && m.type === b[i].type);
const gapless = (mods) => mods.every((m, i) => i === 0 || (mods[i - 1].day || 1) !== (m.day || 1) || mods[i - 1].t[1] === m.t[0]);

// Aller-retour avec les déroulés par défaut (sans trou entre les séquences, ce qui est le cas)
for (const [name, D] of [["une journée", D1], ["deux journées", D2]]) {
  ok(gapless(D), `${name} : déroulé par défaut sans trou`);
  const m = fromProgramme(prog(D));
  const back = toProgramme(m);
  ok(m.days.length === (name === "une journée" ? 1 : 2), `${name} : nombre de journées`);
  ok(same(back.modules.filter((x) => !/jeuner/i.test(x.titre)), D.filter((x) => !/jeuner/i.test(x.titre))), `${name} : aller-retour identique (identifiants, horaires, titres)`);
  ok(back.modules.filter((x) => /jeuner/i.test(x.titre)).every((x, i) => x.t.join() === D.filter((y) => /jeuner/i.test(y.titre))[i].t.join()), `${name} : déjeuner à sa place`);
}

// Horaires en cascade, déjeuner fixe, débordement
{
  const m = fromProgramme(prog(D1));
  const day = m.days[0], tl = timeline(day);
  ok(tl.emargements[0] === day.start && tl.emargements[1] === tl.lunch.t[1], "émargements : début de journée et fin du déjeuner");
  ok(tl.overflow === 0, "déroulé par défaut : la matinée tient avant le déjeuner");
  const longer = updateItem(m, day.am[0].id, { dur: day.am[0].dur + 30 });
  ok(timeline(longer.days[0]).overflow === 30, "matinée allongée de 30 min : débordement de 30 min signalé");
  ok(timeline(longer.days[0]).pm[0].t[0] === tl.pm[0].t[0], "l'après-midi ne bouge pas quand la matinée déborde (déjeuner fixe)");
  const lunchLater = updateDay(m, 0, { lunchAt: "13:00" });
  ok(timeline(lunchLater.days[0]).pm[0].t[0] === "14:00", "déjeuner à 13 h : l'après-midi repart à 14 h");
  ok(timeline(updateDay(m, 0, { lunchDur: 45 }).days[0]).lunch.t[1] === "13:15", "déjeuner de 45 min : fin à 13 h 15");
  ok(timeline(updateDay(m, 0, { start: "09:00" }).days[0]).am[0].t[0] === "09:00", "début de journée modifié");
  ok(updateItem(m, day.am[0].id, { dur: 7 }).days[0].am[0].dur === 5, "durée arrondie par pas de 5 min");
}

// Gestes : déplacer, ajouter, dupliquer, retirer
{
  let m = fromProgramme(prog(D2));
  const first = m.days[0].am[0].id, lastPm = m.days[0].pm.at(-1).id;
  m = moveItem(m, first, { d: 1, half: "pm", index: 0 });
  ok(m.days[1].pm[0].id === first && !m.days[0].am.some((x) => x.id === first), "déplacer une séquence du jour 1 au jour 2");
  m = moveItem(m, lastPm, { d: 0, half: "am", index: 0 });
  ok(m.days[0].am[0].id === lastPm, "déplacer de l'après-midi au matin");
  const order = m.days[0].am.map((x) => x.id);
  const m2 = moveItem(m, order[0], { d: 0, half: "am", index: 2 });
  ok(m2.days[0].am[1].id === order[0], "réordonner dans la même demi-journée (l'élément quitte sa place avant d'être inséré)");
  const r = addItem(m, "pratique", { d: 0, half: "pm", index: 1 });
  ok(r.id && r.model.days[0].pm[1].id === r.id && r.model.days[0].pm[1].type === "pratique", "ajouter un atelier à une place précise");
  const dup = duplicateItem(r.model, r.id);
  ok(dup.id && dup.id !== r.id && dup.model.days[0].pm[2].titre.endsWith("(copie)"), "dupliquer une séquence juste après elle");
  const rm = removeItem(dup.model, dup.id);
  ok(!find(rm, dup.id) && find(rm, r.id), "retirer une séquence");
  ok(find(m, first) && find(fromProgramme(prog(D2)), first), "le modèle d'origine n'est pas touché");
  const ids = toProgramme(dup.model).modules.map((x) => x.id);
  ok(new Set(ids).size === ids.length, "identifiants uniques à l'enregistrement");
}

// Journées : 1 à 5
{
  let m = blankTrame("Nouvelle formation");
  for (let i = 0; i < 6; i++) m = addDay(m);
  ok(m.days.length === MAX_DAYS, "cinq journées au plus");
  ok(m.days[4].lunch.at === "12:30" && m.days[4].start === "09:30", "nouvelle journée : début 9 h 30, déjeuner 12 h 30");
  m = removeDay(m, 2);
  ok(m.days.length === 4, "retirer une journée");
  let one = blankTrame(); one = removeDay(one, 0);
  ok(one.days.length === 1, "au moins une journée");
  const p = toProgramme(m);
  ok(p.nDays === 4 && p.modules.filter((x) => /jeuner/i.test(x.titre)).length === 4, "chaque journée garde son déjeuner");
}

// Déroulé sans déjeuner : ajouté à 12 h 30, séquences réparties
{
  const mods = [{ id: "a", t: ["09:00", "11:00"], type: "comprendre", titre: "A" }, { id: "b", t: ["14:00", "15:00"], type: "pratique", titre: "B" }];
  const m = fromProgramme(prog(mods));
  ok(m.days[0].lunch.at === "12:30" && m.days[0].am.map((x) => x.id).join() === "a" && m.days[0].pm.map((x) => x.id).join() === "b", "sans déjeuner : ajouté à 12 h 30, matin et après-midi répartis");
  ok(toMin(timeline(m.days[0]).pm[0].t[0]) === toMin("13:30"), "l'après-midi recommence à la fin du déjeuner");
}

// Slides et activités
{
  let m = fromProgramme(prog(D1));
  const use = pagesUsage(m, parsePages);
  ok(use.size > 0 && [...use.values()].every((ids) => ids.length >= 1), "pages déjà assignées : page → séquences");
  const id = m.days[0].am[0].id;
  m = updateItem(m, id, { acts: ["niveau", "llm"], quiz: "jargon" });
  const k = trameKeys(m);
  ok(k.acts.includes("niveau") && k.acts.includes("llm") && k.quizzes.includes("jargon"), "clés citées : activités en salle et quiz en autonomie");
  const p = toProgramme({ ...m, slides_url: "https://docs.google.com/presentation/d/abc/edit", slides_n: 120 });
  ok(p.slides_url && p.slides_n === 120 && p.modules.find((x) => x.id === id).acts.length === 2, "lien du support, nombre de slides et activités gardés");
}
// Appliquer une trame à une session, et enregistrer une session comme trame
{
  const bank = { ready: true, items: bankFromData() };
  const usedLive = new Set(D1.map((x) => x.live).filter(Boolean)); // un sondage que le déroulé par défaut ne cite pas déjà
  const poll = bank.items.find((b) => b.kind !== "quiz" && !usedLive.has(b.id)), quiz = bank.items.find((b) => b.kind === "quiz");
  let m = fromProgramme(prog(D1, { slides_url: "https://docs.google.com/presentation/d/abcdefghijklmnopqrstuvwxyz/edit", slides_n: 40 }));
  const a = m.days[0].am[1].id, b = m.days[0].pm[0].id;
  m = updateItem(m, a, { acts: [poll.id, quiz.id] });
  m = updateItem(m, b, { acts: [poll.id] });
  const trame = { ...toProgramme(m), name: "Ma trame" };
  const session = { format: "1", activities: [], quizzes: {}, live: { module: "disparue" }, programme: { ends: { 1: "16:30" } }, slides_url: "" };
  const p = applyPatch(session, trame, bank, { slides: true });
  ok(p.format === "1" && p.programme.ends?.[1] === "16:30" && p.programme.name === "Ma trame", "trame appliquée : déroulé, format, heures de fin gardées");
  const pa = p.activities.find((x) => x.from === poll.id), qa = p.activities.find((x) => x.type === "quiz" && x.quiz === quiz.id);
  ok(pa && qa && pa.at === a && qa.at === a, "quiz et sondage ajoutés à la session et placés dans leur séquence");
  ok(p.activities.filter((x) => x.from === poll.id).length === 1, "une activité citée deux fois n'est ajoutée qu'une fois (à sa première séquence)");
  ok(p.quizzes[quiz.id]?.questions?.length > 0, "le quiz est copié dans la session");
  ok(p.live.module === null && p.slides_url === trame.slides_url, "séquence lancée disparue oubliée, lien du support repris sur demande");
  ok(!("slides_url" in applyPatch(session, trame, bank)), "sans demande, le lien du support ne change pas");
  const placedElsewhere = { ...session, activities: [{ ...pa, id: "deja", at: "ancienne-sequence" }] };
  const p2 = applyPatch(placedElsewhere, trame, bank);
  ok(p2.activities.find((x) => x.id === "deja").at === a && p2.activities.filter((x) => x.from === poll.id).length === 1, "une activité déjà dans la session est réutilisée et replacée");
  const s1 = { format: "1", activities: defaultActivities("1"), quizzes: {}, programme: null, slides_url: "https://docs.google.com/presentation/d/zz/edit" };
  const t1 = trameFromSession(s1);
  ok(t1.nDays === 1 && t1.modules.length === D1.length && t1.slides_url === s1.slides_url, "session enregistrée comme trame : déroulé et support");
  ok(t1.modules.some((x) => x.live), "les activités placées de la session deviennent des activités de la trame");
  const back = applyPatch({ ...s1, activities: [] }, t1, bank);
  ok((back.activities || []).length >= t1.modules.filter((x) => x.live).length, "aller-retour session → trame → session : les activités reviennent");
}
console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests des trames passent.");
