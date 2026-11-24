// Règles de la demande de code (fonction Edge « access ») : même bloc dans src/lib/accessRules.js et
// dans supabase/functions/access/index.ts, puis comportement des validations.
import { readFileSync } from "node:fs";
import { checkFirstName, clientIp, ACCESS_LIMITS } from "../src/lib/accessRules.js";

let fails = 0;
const ok = (c, msg) => { console.log((c ? "ok · " : "ÉCHEC · ") + msg); if (!c) fails++; };
const block = (path) => {
  const src = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const m = src.match(/\/\/ >>> règles de la demande de code\n([\s\S]*?)\/\/ <<< règles de la demande de code/);
  return m ? m[1] : null;
};
const a = block("src/lib/accessRules.js"), b = block("supabase/functions/access/index.ts");
ok(a && b && a === b, "mêmes règles dans le front et dans la fonction access");

for (const n of ["Camille", "Anne-Sophie", "Jean-Paul", "J.-P.", "N’Golo", "O'Brien", "Émilie", "  Léa   Marie "])
  ok(checkFirstName(n).value, `prénom accepté : « ${n.trim()} »`);
ok(checkFirstName("  Léa   Marie ").value === "Léa Marie", "espaces ramenés à un seul");
for (const n of ["", "   ", "Paul www.pirate.fr", "Voir https://x.co", "a@b", "Cliquez ici : bit.ly", "<b>Léa</b>", "123", "Léa ".repeat(12)])
  ok(checkFirstName(n).error, `prénom refusé : « ${n.slice(0, 30)} »`);
ok(clientIp("203.0.113.7, 10.0.0.1") === "203.0.113.7" && clientIp(null) === "inconnue", "adresse IP du client : la première de l'en-tête");
ok(ACCESS_LIMITS.mails[0] < 300, "plafond quotidien d'e-mails sous le quota gratuit de Brevo (300)");

if (fails) { console.error(`\n${fails} test(s) des règles d'accès en échec.`); process.exit(1); }
console.log("\nTous les tests des règles d'accès passent.");
