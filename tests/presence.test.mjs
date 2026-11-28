// Numéro de session et émargement par demi-journée (src/lib/presence.js)
import { sessionNo, halfDays, stateOf, nextValue, isPresent, totals, stateText, presenceCsv, groupTrainees, traineesCsv, signHtml, SLOT_RE } from "../src/lib/presence.js";
import { mainTabOf } from "../src/lib/adminNav.js";

const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const T = (s) => String(s);

// Numéro
ok(sessionNo({ num_year: 2026, num_seq: 12 }) === "2026-012" && sessionNo({ num_year: 2027, num_seq: 1234 }) === "2027-1234", "numéro : année et rang sur trois chiffres au moins");
ok(sessionNo({ title: "Démo" }) === "" && sessionNo(null) === "", "numéro : rien pour une session de démo ou sans numéro");

// Demi-journées
const one = { date: "2026-12-07", format: "1", start_time: "09:30" };
const two = { date: "2026-12-07", date2: "2026-12-08", format: "2", start_time: "09:30" };
const h1 = halfDays(one), h2 = halfDays(two);
ok(h1.map((s) => s.key).join() === "j1-matin,j1-aprem" && h1[0].label === "J1 matin" && h1[1].label === "J1 après-midi", "une journée : matin et après-midi, sans le créneau de l'évaluation");
ok(h2.map((s) => s.key).join() === "j1-matin,j1-aprem,j2-matin,j2-aprem" && h2[2].date === "2026-12-08", "deux journées : quatre demi-journées, chacune à sa date");
ok(h1.every((s) => SLOT_RE.test(s.key)) && !SLOT_RE.test("j1-eval") && !SLOT_RE.test("j6-matin"), "clés de créneau : celles de la base (j1 à j5, matin ou après-midi)");

// États et clic de l'équipe
const at = "2026-12-07T08:34:00.000Z"; // 9 h 34 à Paris
ok(stateOf(undefined) === "none" && stateOf({}) === "none", "rien d'enregistré");
ok(stateOf({ self: at }) === "self", "déclaré par le ou la stagiaire");
ok(stateOf({ self: at, staff: false }) === "absent" && stateOf({ staff: true }) === "present", "la correction de l'équipe l'emporte");
ok(nextValue("none") === true && nextValue("self") === true && nextValue("present") === false && nextValue("absent") === null, "clic : présent·e, absent·e, puis retour à la déclaration");
ok(isPresent("self") && isPresent("present") && !isPresent("absent") && !isPresent("none"), "décompte : déclaré ou validé");
ok(stateText({ self: at }) === "émargé à 9 h 34" && stateText({ self: at, staff: true }).startsWith("présent·e (émargé à 9 h 34"), "texte de la case, heure de Paris");
const rows = [
  { user_id: "a", full_name: "Ada", email: "ada@x.fr", presence: { "j1-matin": { self: at }, "j1-aprem": { staff: false } } },
  { user_id: "b", full_name: "=HYPERLINK(\"x\")", email: "bob@x.fr", presence: { "j1-matin": { staff: true } } },
];
ok(totals(h1, rows).join() === "2,0", "présent·es par demi-journée");
const csv = presenceCsv(one, rows);
ok(csv.split("\r\n")[0].includes("J1 matin (2026-12-07)") && csv.includes("émargé à 9 h 34") && csv.includes("absent·e"), "tableur : une colonne par demi-journée, état lisible");
ok(csv.includes(`"'=HYPERLINK(""x"")"`), "tableur : formule neutralisée");

// Adresses des stagiaires
const sessions = [{ id: "s1", title: "IA générative", date: "2026-12-07", num_year: 2026, num_seq: 3 }, { id: "s2", title: "IA générative", date: "2026-11-02", num_year: 2026, num_seq: 1 }];
const g = groupTrainees([
  { email: "Ada@x.fr", full_name: "Ada", session_id: "s2", joined: true, joined_at: "2026-11-02T08:00:00Z" },
  { email: "ada@x.fr", full_name: null, session_id: "s1", joined: true },
  { email: "nina@x.fr", full_name: null, session_id: "s1", joined: false },
], sessions);
ok(g.length === 2 && g.find((e) => e.email === "ada@x.fr").sessions.map((s) => s.no).join() === "2026-003,2026-001", "stagiaires : une ligne par adresse, sessions de même titre distinguées par leur numéro");
ok(g.find((e) => e.email === "nina@x.fr").joined === false && g.find((e) => e.email === "ada@x.fr").full_name === "Ada", "stagiaires : invité·e non inscrit·e, nom repris");
ok(traineesCsv(g).includes("2026-003 IA générative (2026-12-07) | 2026-001 IA générative (2026-11-02)"), "stagiaires : tableur avec numéros et dates");

// Bouton « J'ai émargé »
ok(signHtml(h1[0], {}, T).includes('data-sign="j1-matin"') && signHtml(h1[0], {}, T).includes("J'ai émargé ce matin"), "bouton : créneau du matin ouvert");
ok(signHtml(h1[1], { "j1-aprem": { self: at } }, T).includes("Émargement enregistré à 9 h 34") && !signHtml(h1[1], { "j1-aprem": { self: at } }, T).includes("data-sign"), "bouton : une fois touché, l'heure enregistrée");
ok(signHtml(null, {}, T) === "" && signHtml({ key: "j1-eval" }, {}, T) === "", "bouton : rien hors créneau ni pour l'évaluation");

// Onglets principaux
ok(mainTabOf("#/admin") === "sessions" && mainTabOf("#/admin/s/x/jour") === "sessions" && mainTabOf("#/s/x/jour") === "sessions", "navigation : Sessions (liste, session, aperçu stagiaire)");
ok(mainTabOf("#/admin/trames/x") === "studio" && mainTabOf("#/admin/quiz/liste-sondages") === "studio", "navigation : Studio");
ok(mainTabOf("#/admin/participants/stagiaires") === "participants" && mainTabOf("#/admin/equipe/fiches/1") === "participants", "navigation : Participants et formateurs (comptes et fiches compris)");
ok(mainTabOf("#/admin/reglages/mail") === "reglages" && mainTabOf("#/profil") === "", "navigation : réglages généraux à part, profil sans onglet");

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests de l'émargement passent.");
