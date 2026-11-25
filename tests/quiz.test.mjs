// Quiz et sondages : reprise de data.js, clés de réponse inchangées, contrôles de l'éditeur, copies dans la session.
import { readFileSync } from "node:fs";
import { QUIZ, PRESETS, D2 } from "../src/data.js";
import { legacyQuiz, bankFromData, quizFor, quizQ, respKey, respKeys, cleanQuiz, cleanPoll, snapshotQuizzes, quizKeysOf, outdated, pollFor, newItemId, newQid, ID_RE, copyOf, pollActivity, LIMITS } from "../src/lib/quizzes.js";
import { defaultActivities } from "../src/lib/activities.js";
import { parseConducteur } from "../src/lib/conducteur.js";
import { MIGRATION, START, END, seedSql } from "../scripts/seed-quiz-bank.mjs";
const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };

// Reprise de data.js
const L = legacyQuiz("llm");
ok(L.titre === QUIZ.llm.titre && L.questions.length === QUIZ.llm.q.length, "quiz repris : titre et nombre de questions");
ok(L.questions.every((q, i) => q.id === String(i) && q.q === QUIZ.llm.q[i][0] && q.ok === QUIZ.llm.q[i][2] && JSON.stringify(q.o) === JSON.stringify(QUIZ.llm.q[i][1])), "quiz repris : identifiants « 0 », « 1 »… et contenu identique");
const bank = bankFromData();
ok(bank.length === Object.keys(QUIZ).length + Object.keys(PRESETS).length, "bibliothèque de secours : tous les quiz et sondages de data.js");
ok(bank.every((b) => ID_RE.test(b.id) && b.titre && b.titre.length <= LIMITS.titre), "bibliothèque de secours : identifiants et titres valides");
ok(legacyQuiz("constructor") === null && quizFor(null, "inconnu") === null && quizFor({}, "") === null, "clé inconnue : null, sans plantage");

// Clés de réponse : inchangées pour les anciennes sessions et les quiz repris
const act = { id: "quiz-llm", type: "quiz", quiz: "llm" }, live = { qi: 2 };
ok(respKey(act, live, { activities: [act] }) === "quiz-llm#2", "ancienne session sans copie : clé quiz-llm#2, comme avant");
const copied = { activities: [act], quizzes: snapshotQuizzes({}, ["llm"], bank) };
ok(respKey(act, live, copied) === "quiz-llm#2", "quiz copié depuis la bibliothèque : même clé");
ok(respKey(act, { qi: 0 }, copied) === "quiz-llm#0" && respKey(act, {}, copied) === "quiz-llm#0", "première question : quiz-llm#0");
const own = { quizzes: { "s-perso-ab12": { titre: "Perso", questions: [{ id: "q-abc123", q: "?", o: ["a", "b"], ok: 1, why: "" }] } } };
const a2 = { id: "a1", type: "quiz", quiz: "s-perso-ab12" };
ok(respKey(a2, {}, own) === "a1#q-abc123" && quizQ(a2, {}, own).q === "?", "question créée dans l'éditeur : clé par identifiant");
ok(respKey({ id: "niveau", type: "poll" }, {}, own) === "niveau", "sondage : clé de l'activité");
ok(respKeys(act, copied).length === QUIZ.llm.q.length && respKeys(a2, own)[0] === "a1#q-abc123", "toutes les clés d'un quiz");
ok(quizFor({ quizzes: { llm: { titre: "Vide", questions: [] } } }, "llm").titre === QUIZ.llm.titre, "copie vide ignorée : data.js en secours");

// Contrôles de l'éditeur
const good = cleanQuiz({ titre: "  Mon   quiz ", questions: [{ q: "Question ?", o: ["Oui", "Non"], ok: 0, why: "Parce que." }] });
ok(!good.errors.length && good.value.titre === "Mon quiz" && good.value.questions[0].id.startsWith("q-"), "quiz valide : espaces nettoyés, identifiant attribué");
ok(cleanQuiz({ titre: "", questions: [] }).errors.length === 2, "quiz sans titre ni question : deux erreurs");
ok(cleanQuiz({ titre: "T", questions: [{ q: "?", o: ["seule"], ok: 0 }] }).errors.some((e) => e.includes("au moins deux")), "une seule réponse : refus");
ok(cleanQuiz({ titre: "T", questions: [{ q: "", o: ["a", "b"], ok: 0 }] }).errors.some((e) => e.includes("énoncé")), "énoncé vide : refus");
ok(cleanQuiz({ titre: "T", questions: [{ q: "?", o: ["a", "b", ""], ok: 2 }] }).errors.some((e) => e.includes("bonne réponse")), "bonne réponse sur une case vide : refus");
const remap = cleanQuiz({ titre: "T", questions: [{ q: "?", o: ["", "a", "b"], ok: 2 }] });
ok(!remap.errors.length && remap.value.questions[0].ok === 1 && remap.value.questions[0].o.join() === "a,b", "case vide retirée : la bonne réponse suit");
ok(cleanQuiz({ titre: "T", questions: [{ q: "?", o: ["1", "2", "3", "4", "5", "6", "7"], ok: 0 }] }).errors.some((e) => e.includes("6 réponses")), "sept réponses : refus");
ok(cleanQuiz({ titre: "T", questions: Array.from({ length: 31 }, () => ({ q: "?", o: ["a", "b"], ok: 0 })) }).errors.some((e) => e.includes("30 questions")), "trente et une questions : refus");
const dup = cleanQuiz({ titre: "T", questions: [{ id: "q-x", q: "?", o: ["a", "b"], ok: 0 }, { id: "q-x", q: "?", o: ["a", "b"], ok: 1 }] });
ok(dup.value.questions[0].id === "q-x" && dup.value.questions[1].id !== "q-x", "identifiant en double : le second est renouvelé");
ok(cleanQuiz({ titre: "T", questions: [{ id: "<img>", q: "?", o: ["a", "b"], ok: 0 }] }).value.questions[0].id.startsWith("q-"), "identifiant hors format : renouvelé");
ok(cleanQuiz({ titre: "x".repeat(200), questions: [{ q: "y".repeat(900), o: ["a", "b"], ok: 0 }] }).value.questions[0].q.length === LIMITS.q, "textes trop longs : coupés aux plafonds");
ok(cleanPoll({ titre: "T", q: "?", o: ["seule"] }, "poll").errors.length === 1, "sondage à une réponse : refus");
ok(!cleanPoll({ titre: "T", q: "?" }, "cloud").errors.length && cleanPoll({ titre: "T", q: "?" }, "cloud").value.o === undefined, "nuage de mots : pas de réponses");
ok(cleanPoll({ titre: "T", q: "?", o: Array.from({ length: 9 }, (_, i) => "r" + i) }, "poll").errors.some((e) => e.includes("8 réponses")), "sondage à neuf réponses : refus");

// Copies dans la session
const kept = snapshotQuizzes({ llm: { titre: "Ma version", questions: [{ id: "0", q: "?", o: ["a", "b"], ok: 0, why: "" }] } }, ["llm", "sve", "inconnu"], bank);
ok(kept.llm.titre === "Ma version" && kept.sve.titre === QUIZ.sve.titre && !kept.inconnu, "copie : rien d'écrasé, quiz manquants ajoutés, clé inconnue ignorée");
const keys = quizKeysOf(defaultActivities("2"), D2);
ok(["llm", "redac", "rmctf", "sve", "jargon", "donnees"].every((k) => keys.includes(k)), "clés nécessaires : activités et séquences du déroulé");
const it = bank.find((b) => b.id === "llm");
ok(!outdated(copyOf(it), it) && outdated(copyOf(it), { ...it, titre: "Autre" }), "mise à jour proposée seulement si la bibliothèque diffère");
const nv = bank.find((b) => b.id === "niveau");
ok(!outdated(pollActivity(nv), nv) && outdated(pollActivity(nv), { ...nv, content: { ...nv.content, o: ["x", "y"] } }), "sondage : même règle");
const custom = bank.map((b) => (b.id === "niveau" ? { ...b, content: { q: "Niveau modifié ?", o: ["A", "B"] } } : b));
ok(defaultActivities("1", custom).find((a) => a.id === "niveau").q === "Niveau modifié ?" && defaultActivities("1").find((a) => a.id === "niveau").q === PRESETS.niveau.q, "activités par défaut : bibliothèque, sinon data.js");
ok(pollFor({ activities: [{ id: "niveau", q: "Version session" }] }, "niveau").q === "Version session" && pollFor(null, "niveau").q === PRESETS.niveau.q && pollFor(null, "inconnu") === null, "activité prévue dans le déroulé : session, sinon data.js");
ok(ID_RE.test(newItemId("Évaluation à chaud : l'essentiel !")) && ID_RE.test(newItemId("", "s-")) && /^q-[a-z0-9]{6}$/.test(newQid()), "identifiants générés valides");

// Conducteur : quiz et activités de la bibliothèque acceptés
const md = `## 09:00-10:00 · Séquence\ntype: comprendre\nquiz: mon-quiz-ab12\nactivité: mon-sondage-cd34`;
const withBank = parseConducteur(md, { quizzes: ["mon-quiz-ab12"], live: ["mon-sondage-cd34"] });
ok(withBank.programme.modules[0].quiz === "mon-quiz-ab12" && withBank.programme.modules[0].live === "mon-sondage-cd34" && !withBank.warnings.length, "conducteur : quiz et sondage de la bibliothèque acceptés");
const withoutBank = parseConducteur(md);
ok(!withoutBank.programme.modules[0].quiz && withoutBank.warnings.length === 2, "conducteur : clés inconnues retirées avec une remarque");

// Contenu de départ de la migration : à jour avec data.js
const sql = readFileSync(MIGRATION, "utf8");
ok(sql.slice(sql.indexOf(START) + START.length, sql.indexOf(END)).trim() === seedSql(), "migration : contenu de départ identique à data.js (sinon : node scripts/seed-quiz-bank.mjs)");

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests des quiz et sondages passent.");
