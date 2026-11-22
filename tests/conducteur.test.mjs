// Conducteur Markdown : aller-retour sans perte sur les déroulés existants, erreurs et remarques attendues.
import { D1, D2 } from "../src/data.js";
import { parseConducteur, conducteurMarkdown, DAY_TITLES_2 } from "../src/lib/conducteur.js";
import { readFileSync } from "node:fs";
const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const norm = (o) => Array.isArray(o) ? o.map(norm) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => [k, norm(o[k])])) : o;
const same = (a, b) => JSON.stringify(norm({ ...a, id: undefined, day: a.day || 1 })) === JSON.stringify(norm({ ...b, id: undefined, day: b.day || 1 }));

for (const [name, mods, days] of [["une journée", D1, {}], ["deux journées", D2, DAY_TITLES_2]]) {
  const r = parseConducteur(conducteurMarkdown(mods, { formation: "Prendre en main les IA génératives", days }));
  ok(!r.errors.length && !r.warnings.length, `${name} : export relu sans erreur ni remarque`);
  ok(r.programme.modules.length === mods.length && mods.every((m, k) => same(m, r.programme.modules[k])), `${name} : aller-retour sans perte`);
}
const f = (n) => readFileSync(new URL(`../docs/conducteurs/${n}`, import.meta.url), "utf8");
ok(parseConducteur(f("conducteur-2-jours.md")).programme.nDays === 2, "fichier deux journées : deux journées lues");
const at = parseConducteur(f("conducteur-test-atelier.md"));
ok(!at.errors.length && at.programme.modules.length === 5 && at.programme.modules[2].type === "pause", "conducteur de test lu (5 séquences, une pause)");

const bad = parseConducteur(`## 10:00-09:00 · À l'envers\ntype: atelier libre\nquiz: inexistant\n## 9h30 · Sans fin\n# Jour 3\n## 09:00-10:00 · Trop loin`);
ok(bad.errors.some((e) => e.includes("finit avant")), "horaires inversés : erreur");
ok(bad.errors.some((e) => e.includes("horaires introuvables")), "horaire de fin manquant : erreur");
ok(bad.errors.some((e) => e.includes("type « atelier libre »")), "type inconnu : erreur");
ok(bad.warnings.some((e) => e.includes("quiz « inexistant »")), "quiz inconnu : remarque et retrait");
ok(bad.errors.some((e) => e.includes("deux au plus")), "trois journées : refus");
ok(parseConducteur("Bonjour").errors.length === 1, "texte sans séquence : refus");
console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests du conducteur passent.");
