// Test du schéma Supabase dans un Postgres embarqué (PGlite).
// On simule le schéma `auth` de Supabase, puis on vérifie les droits :
// un·e stagiaire ne voit ni les autres cadrages ni les réponses nominatives,
// ne peut pas se promouvoir formateur, ne peut pas s'auto-émarger.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const fails = async (sql, m) => { try { await db.exec(sql); ok(false, m); } catch { ok(true, m); } };

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('test.email', true)) $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
`);
try { await db.exec(readFileSync(new URL("../supabase/migrations/20261121000000_init.sql", import.meta.url), "utf8")); } catch (e) { console.error("Migration :", e.message, e.where||""); process.exit(1); }
await db.exec(`grant select on all tables in schema public to authenticated;`); // défaut Supabase
ok(true, "migration appliquée");

const T = "00000000-0000-0000-0000-00000000000a", A = "00000000-0000-0000-0000-00000000000b", B = "00000000-0000-0000-0000-00000000000c";
await db.exec(`insert into trainer_emails values ('formateur@exemple.fr');
insert into auth.users (id,email,raw_user_meta_data) values
 ('${T}','Formateur@exemple.fr','{"full_name":"Gerald"}'),('${A}','alice@exemple.fr','{}'),('${B}','bob@exemple.fr','{"name":"Bob"}');`);
const roles = await db.query(`select email, role, full_name from profiles order by email`);
ok(roles.rows.find(r => r.email === "formateur@exemple.fr").role === "trainer", "profil formateur créé par le déclencheur");
ok(roles.rows.find(r => r.email === "bob@exemple.fr").full_name === "Bob", "nom repris de Google");

const as = async (uid, email) => db.exec(`reset role; set test.uid='${uid}'; set test.email='${email}'; set role authenticated;`);

// Formateur : crée une session, invite Alice
await as(T, "formateur@exemple.fr");
const s = await db.query(`insert into sessions (title) values ('Libération · 2 décembre') returning id, code`);
const sid = s.rows[0].id, code = s.rows[0].code;
ok(/^[0-9A-F]{6}$/.test(code), "code de session généré : " + code);
await db.exec(`insert into session_invites values ('${sid}','alice@exemple.fr'); insert into resources (session_id,title,url) values ('${sid}','Charte','https://exemple.fr')`);
await db.exec(`update sessions set status='live' where id='${sid}'`);

// Alice : réclame son invitation, cadre son projet, répond
await as(A, "alice@exemple.fr");
ok((await db.query(`select public.claim_invites() n`)).rows[0].n === 1, "invitation rattachée");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 1, "Alice voit sa session");
ok((await db.query(`select count(*)::int n from resources`)).rows[0].n === 1, "Alice voit les ressources");
await db.exec(`insert into projects (session_id, data) values ('${sid}', '{"retenu":{"titre":"Veille municipale"},"steps":["profil"]}')`);
await db.exec(`insert into responses (session_id, activity_id, value) values ('${sid}','niveau','1')
  on conflict (session_id,user_id,activity_id) do update set value = excluded.value`);
await fails(`update profiles set role='trainer' where id='${A}'`, "Alice ne peut pas se promouvoir formatrice");
await fails(`update session_members set attended=true where user_id='${A}'`, "Alice ne peut pas s'auto-émarger");
await fails(`update projects set trainer_comment='parfait' where user_id='${A}'`, "Alice ne peut pas écrire le retour formateur");
await fails(`select public.session_roster('${sid}')`, "Alice n'accède pas au tableau des participants");
await db.exec(`insert into threads (session_id, title) values ('${sid}', 'Question sur les connecteurs')`);
ok((await db.query(`select author_name from threads`)).rows[0].author_name === "alice", "nom d'auteur renseigné automatiquement");

// Bob : rejoint par code, ne voit pas le cadrage ni la réponse d'Alice
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 0, "Bob ne voit pas la session avant de la rejoindre");
await db.query(`select public.join_session('${code.toLowerCase()}')`);
ok((await db.query(`select count(*)::int n from projects`)).rows[0].n === 0, "Bob ne voit pas le cadrage d'Alice");
ok((await db.query(`select count(*)::int n from responses`)).rows[0].n === 0, "Bob ne voit pas la réponse nominative d'Alice");
await db.exec(`insert into responses (session_id, activity_id, value) values ('${sid}','niveau','1')`);
const agg = await db.query(`select * from public.live_results('${sid}','niveau')`);
ok(agg.rows.length === 1 && Number(agg.rows[0].n) === 2, "résultats agrégés visibles (2 réponses)");
ok((await db.query(`select count(*)::int n from threads`)).rows[0].n === 1, "Bob lit la discussion");
await fails(`insert into sessions (title) values ('pirate')`, "Bob ne peut pas créer de session");

// Formateur : tableau, émargement, retour, duplication
await as(T, "formateur@exemple.fr");
const roster = await db.query(`select * from public.session_roster('${sid}')`);
ok(roster.rows.length === 2 && roster.rows.some(r => r.project_title === "Veille municipale"), "tableau des participants avec cadrage");
await db.query(`select public.set_attended('${sid}','${A}', true)`);
const pid = (await db.query(`select id from projects`)).rows[0].id;
await db.query(`select public.comment_project('${pid}','Parfait, cadre bien les sources.')`);
const dup = await db.query(`select public.duplicate_session('${sid}') id`);
ok((await db.query(`select count(*)::int n from resources where session_id='${dup.rows[0].id}'`)).rows[0].n === 1, "duplication avec ressources");

// Anonyme : rien
await db.exec(`reset role; set test.uid=''; set role anon;`);
await fails(`select public.join_session('${code}')`, "un visiteur non connecté ne peut rien rejoindre");
console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests SQL passent.");
