/* Écrit, dans la migration 20261126000000_quiz_sondages.sql, le contenu de départ de la bibliothèque
   « Quiz et sondages » : les quiz et sondages de src/data.js, sous la forme des lignes de quiz_bank.
   Usage : node scripts/seed-quiz-bank.mjs   (tests/quiz.test.mjs vérifie que le bloc est à jour) */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bankFromData } from "../src/lib/quizzes.js";

export const MIGRATION = fileURLToPath(new URL("../supabase/migrations/20261126000000_quiz_sondages.sql", import.meta.url));
export const START = "-- >>> contenu repris de data.js", END = "-- <<< contenu repris de data.js";

// Texte SQL entre guillemets dollar : le contenu ne contient jamais la balise
const dq = (s) => { if (s.includes("$qb$")) throw new Error("balise $qb$ dans le contenu"); return `$qb$${s}$qb$`; };

export function seedSql() {
  const rows = bankFromData().map((r) => `  (${dq(r.id)}, ${dq(r.kind)}, ${dq(r.titre)}, ${dq(JSON.stringify(r.content))}::jsonb)`);
  return `insert into public.quiz_bank (id, kind, titre, content) values\n${rows.join(",\n")}\non conflict (id) do nothing;`;
}
export function withSeed(sql) {
  const a = sql.indexOf(START), b = sql.indexOf(END);
  if (a < 0 || b < a) throw new Error("repères du bloc introuvables dans la migration");
  return sql.slice(0, a + START.length) + "\n" + seedSql() + "\n" + sql.slice(b);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(MIGRATION, withSeed(readFileSync(MIGRATION, "utf8")));
  console.log(`Contenu de départ écrit (${bankFromData().length} éléments) dans ${MIGRATION}`);
}
