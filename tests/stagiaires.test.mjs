// Numéro de session, adresses des stagiaires (src/lib/stagiaires.js) et onglets principaux (src/lib/adminNav.js)
import { sessionNo, groupTrainees, traineesCsv } from "../src/lib/stagiaires.js";
import { mainTabOf } from "../src/lib/adminNav.js";

const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };

// Numéro
ok(sessionNo({ num_year: 2026, num_seq: 12 }) === "2026-012" && sessionNo({ num_year: 2027, num_seq: 1234 }) === "2027-1234", "numéro : année et rang sur trois chiffres au moins");
ok(sessionNo({ title: "Démo" }) === "" && sessionNo(null) === "", "numéro : rien pour une session de démo ou sans numéro");

// Adresses des stagiaires
const sessions = [{ id: "s1", title: "IA générative", date: "2026-12-07", num_year: 2026, num_seq: 3 }, { id: "s2", title: "IA générative", date: "2026-11-02", num_year: 2026, num_seq: 1 }];
const g = groupTrainees([
  { email: "Ada@x.fr", full_name: "Ada", session_id: "s2", joined: true, joined_at: "2026-11-02T08:00:00Z" },
  { email: "ada@x.fr", full_name: null, session_id: "s1", joined: true },
  { email: "nina@x.fr", full_name: null, session_id: "s1", joined: false },
  { email: "=cmd@x.fr", full_name: "=HYPERLINK(\"x\")", session_id: "s1", joined: true },
], sessions);
ok(g.length === 3 && g.find((e) => e.email === "ada@x.fr").sessions.map((s) => s.no).join() === "2026-003,2026-001", "stagiaires : une ligne par adresse, sessions de même titre distinguées par leur numéro");
ok(g.find((e) => e.email === "nina@x.fr").joined === false && g.find((e) => e.email === "ada@x.fr").full_name === "Ada", "stagiaires : invité·e non inscrit·e, nom repris");
const csv = traineesCsv(g);
ok(csv.includes("2026-003 IA générative (2026-12-07) | 2026-001 IA générative (2026-11-02)"), "stagiaires : tableur avec numéros et dates");
ok(csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes(`"'=cmd@x.fr"`), "stagiaires : formules neutralisées dans le tableur");

// Onglets principaux
ok(mainTabOf("#/admin") === "sessions" && mainTabOf("#/admin/s/x/jour") === "sessions" && mainTabOf("#/s/x/jour") === "sessions", "navigation : Sessions (liste, session, aperçu stagiaire)");
ok(mainTabOf("#/admin/trames/x") === "studio" && mainTabOf("#/admin/quiz/liste-sondages") === "studio", "navigation : Studio");
ok(mainTabOf("#/admin/participants") === "participants" && mainTabOf("#/admin/equipe/fiches/1") === "participants", "navigation : Participants et formateurs (comptes et fiches compris)");
ok(mainTabOf("#/admin/reglages/mail") === "reglages" && mainTabOf("#/profil") === "", "navigation : réglages généraux à part, profil sans onglet");

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests des stagiaires passent.");
