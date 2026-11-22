// Les migrations doivent pouvoir être ré-exécutées sans erreur (SQL Editor de Supabase).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`);
const files = ["20261121000000_init.sql","20261122000000_v3_acces_pilotage.sql","20261122010000_logos_clair_sombre.sql","20261122020000_emargement_libelle.sql", "20261122030000_presentations.sql", "20261122040000_emargement_second.sql", "20261122050000_evaluation.sql"];
for (let i = 0; i < 2; i++) for (const f of files) {
  try { await db.exec(readFileSync(new URL("../supabase/migrations/" + f, import.meta.url), "utf8")); }
  catch (e) { console.log("ÉCHEC passage", i + 1, f, e.message); process.exit(1); }
}
console.log("Les migrations passent deux fois de suite.");
