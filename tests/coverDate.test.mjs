// Date de la page de garde du support PDF (src/lib/coverDate.js) et motif recopié dans google/support-pdf.gs
import { readFileSync } from "node:fs";
import { coverDate, COVER_DATE, COVER_LABEL_RE } from "../src/lib/coverDate.js";

const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const s = (dates, format = String(dates.length)) => ({ date: dates[0], date2: dates[1] || null, dates, format });

// Forme de la date
ok(coverDate(s(["2026-11-27"])) === "27 novembre 2026", "une journée");
ok(coverDate(s(["2026-12-01"])) === "1er décembre 2026", "une journée, le 1er");
ok(coverDate(s(["2026-11-19", "2026-11-20"])) === "19 - 20 novembre 2026", "deux journées qui se suivent");
ok(coverDate(s(["2026-12-01", "2026-12-02"])) === "1er - 2 décembre 2026", "deux journées, dont le 1er (session 2026-004, deck FTV)");
ok(coverDate(s(["2026-11-30", "2026-12-01"])) === "30 novembre - 1er décembre 2026", "deux journées à cheval sur deux mois");
ok(coverDate(s(["2026-12-31", "2027-01-01"])) === "31 décembre 2026 - 1er janvier 2027", "deux journées à cheval sur deux années");
ok(coverDate(s(["2026-11-19", "2026-11-26"])) === "19 et 26 novembre 2026", "deux journées qui ne se suivent pas");
ok(coverDate(s(["2026-12-01", "2026-12-08", "2026-12-15"])) === "1er, 8 et 15 décembre 2026", "trois journées du même mois");
ok(coverDate(s(["2026-11-30", "2026-12-02"])) === "30 novembre et 2 décembre 2026", "deux mois, journées séparées");
ok(coverDate({ format: "1" }) === "", "sans date : rien");
ok(coverDate({ date: "2026-12-09", date2: "2026-12-10", format: "2" }) === "9 - 10 décembre 2026", "ancienne session à deux dates (date, date2)");

// Motif : retrouve la date de la page de garde des vrais decks, et rien d'autre
const found = (t) => COVER_DATE.exec(t)?.[0] || "";
ok(found("19 - 20 novembre 2026\n") === "19 - 20 novembre 2026", "deck FTV : « 19 - 20 novembre 2026 »");
ok(found("27 novembre 2026\n") === "27 novembre 2026", "deck Libération : « 27 novembre 2026 »");
for (const t of ["1er - 2 décembre 2026", "30 novembre - 1er décembre 2026", "31 décembre 2026 - 1er janvier 2027", "1er, 8 et 15 décembre 2026", "30 novembre et 2 décembre 2026", "19 – 20 NOVEMBRE 2026", "2 au 3 décembre 2026"])
  ok(found(`Formation\n${t}\n`) === t, `retrouve « ${t} » (et donc une date déjà remplacée)`);
for (const t of ["Plateformes, données, prompting, vibe coding\nSession 2026\n", "JOURNALISME & IA · 2026\n", "FORMATION\n", "EXPLORER LES OUTILS D’IA POUR UN JOURNALISME AUGMENTÉ\n"])
  ok(found(t) === "", `ne prend rien dans « ${t.trim().replace(/\n/g, " / ")} »`);
ok(found("Session 12026 novembre") === "", "pas de date au milieu d'un nombre");

// Date transmise à la fonction : forme contrôlée
for (const t of ["27 novembre 2026", "1er - 2 décembre 2026", "31 décembre 2026 - 1er janvier 2027", "1er, 8 et 15 décembre 2026"]) ok(COVER_LABEL_RE.test(t), `date acceptée : « ${t} »`);
for (const t of ["", "<b>2026</b>", "27 novembre", "x".repeat(90) + " 2026", "1er décembre 2026; drop"]) ok(!COVER_LABEL_RE.test(t), `date refusée : « ${t.slice(0, 30)} »`);

// Le motif est recopié à l'identique dans le script Google
const block = (src) => src.match(/\/\/ >>> motif de la date de page de garde\n([\s\S]*?)\/\/ <<< motif de la date de page de garde/)?.[1];
const a = block(readFileSync(new URL("../src/lib/coverDate.js", import.meta.url), "utf8"));
const b = block(readFileSync(new URL("../google/support-pdf.gs", import.meta.url), "utf8"));
ok(!!a && a === b, "motif identique dans src/lib/coverDate.js et google/support-pdf.gs");

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests de la date de page de garde passent.");
