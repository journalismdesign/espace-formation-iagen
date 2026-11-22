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
-- Pas de droits par défaut : comme les projets Supabase récents, les migrations doivent tout accorder elles-mêmes
`);
for (const f of ["20261121000000_init.sql", "20261122000000_v3_acces_pilotage.sql", "20261122010000_logos_clair_sombre.sql", "20261122020000_emargement_libelle.sql", "20261122030000_presentations.sql", "20261122040000_emargement_second.sql", "20261122050000_evaluation.sql", "20261122060000_code_formateur.sql", "20261122070000_formateurs.sql", "20261122080000_premiere_connexion.sql", "20261122090000_droits_explicites.sql", "20261122100000_conducteur_habillages.sql", "20261123000000_roles_admin.sql"]) {
  try { await db.exec(readFileSync(new URL("../supabase/migrations/" + f, import.meta.url), "utf8")); }
  catch (e) { console.error("Migration", f, ":", e.message, e.where || ""); process.exit(1); }
}
ok(true, "migration appliquée");

const T = "00000000-0000-0000-0000-00000000000a", A = "00000000-0000-0000-0000-00000000000b", B = "00000000-0000-0000-0000-00000000000c";
await db.exec(`insert into trainer_emails (email, is_admin) values ('formateur@exemple.fr', true);
insert into auth.users (id,email,raw_user_meta_data) values
 ('${T}','Formateur@exemple.fr','{"full_name":"Gerald"}'),('${A}','alice@exemple.fr','{}'),('${B}','bob@exemple.fr','{"name":"Bob"}');`);
const roles = await db.query(`select email, role, full_name from profiles order by email`);
ok(roles.rows.find(r => r.email === "formateur@exemple.fr").role === "admin", "profil admin créé par le déclencheur");
ok(roles.rows.find(r => r.email === "bob@exemple.fr").full_name === "Bob", "nom repris de Google");

const as = async (uid, email) => db.exec(`reset role; set test.uid='${uid}'; set test.email='${email}'; set request.jwt.claims='{"role":"authenticated"}'; set role authenticated;`);

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

// v3 : support, logos, codes, page publique
await db.exec(`reset role; update sessions set date = current_date + 1, end_time = '23:59', format = '1' where id = '${sid}';
  insert into session_support values ('${sid}', 'https://drive.google.com/support.pdf');
  insert into access_codes (session_id, email, code_hash, expires_at) values ('${sid}', 'bob@exemple.fr', 'x', now() + interval '1 day');`);
await as(B, "bob@exemple.fr");
let st = (await db.query(`select * from public.support_status('${sid}')`)).rows[0];
ok(st.unlocked === false && st.url === null && st.configured === true, "support verrouillé : lien masqué au stagiaire");
ok((await db.query(`select count(*)::int n from session_support`)).rows[0].n === 0, "le stagiaire ne lit pas la table du support");
await fails(`select * from access_codes`, "les codes d'accès sont illisibles côté client");
ok((await db.query(`select count(*)::int n from brands`)).rows[0].n === 3, "trois logos préenregistrés lisibles");
await db.exec(`update brands set name = 'pirate' || name`);
ok((await db.query(`select count(*)::int n from brands where name like 'pirate%'`)).rows[0].n === 0, "le stagiaire ne modifie pas les logos");
await as(T, "formateur@exemple.fr");
await db.exec(`update sessions set date = current_date - 1 where id = '${sid}'`); // formation passée → débloqué
await as(B, "bob@exemple.fr");
st = (await db.query(`select * from public.support_status('${sid}')`)).rows[0];
ok(st.unlocked === true && st.url.includes("support.pdf"), "support débloqué une heure avant la fin");
await db.exec(`reset role; set test.uid=''; set role anon;`);
const pub = await db.query(`select * from public.session_public('${code}')`);
ok(pub.rows.length === 1 && pub.rows[0].org_name === "Samsa", "slide d'ouverture lisible sans connexion");
await as(T, "formateur@exemple.fr");
await db.exec(`update sessions set status = 'closed' where id = '${sid}'`);
await db.exec(`reset role;`);
ok((await db.query(`select count(*)::int n from access_codes where session_id='${sid}'`)).rows[0].n === 0, "codes détruits à la clôture");
ok((await db.query(`select count(*)::int n from public.session_public('${code}')`)).rows[0].n === 0, "session close invisible publiquement");

// Profils intervenant·es
await as(T, "formateur@exemple.fr");
await db.exec(`insert into trainers (name, roles) values ('Gerald Holubowicz', '[{"label":"Formateur","value":"samsa.fr"}]')`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from trainers`)).rows[0].n === 1, "le stagiaire lit la fiche de l'intervenant");
await db.exec(`update trainers set name = 'pirate'`);
ok((await db.query(`select count(*)::int n from trainers where name = 'pirate'`)).rows[0].n === 0, "le stagiaire ne modifie pas la fiche");

// Code formateur
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
await db.query(`select public.set_trainer_code('Samsa-2026!')`); // SQL Editor
await db.exec(`set request.jwt.claims='{"role":"anon"}'; set role anon;`);
ok((await db.query(`select public.check_trainer_code('Samsa-2026!') ok`)).rows[0].ok === true, "code formateur accepté");
ok((await db.query(`select public.check_trainer_code('mauvais') ok`)).rows[0].ok === false, "mauvais code refusé");
await fails(`select * from private_settings`, "empreinte du code illisible");
await fails(`select public.set_trainer_code('pirate123')`, "un visiteur ne change pas le code");
await as(B, "bob@exemple.fr");
await fails(`select public.set_trainer_code('pirate123')`, "un stagiaire ne change pas le code");

// Première connexion : adresse déclarée après la création du compte
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
const C = "00000000-0000-0000-0000-00000000000d";
await db.exec(`insert into auth.users (id,email) values ('${C}','claire@exemple.fr');`);
await as(C, "claire@exemple.fr");
ok((await db.query(`select public.claim_trainer() ok`)).rows[0].ok === false, "adresse non déclarée : pas formateur");
await db.exec(`reset role; set test.uid=''; set request.jwt.claims=''; insert into trainer_emails values ('claire@exemple.fr');`);
ok((await db.query(`select role from profiles where id='${C}'`)).rows[0].role === "trainer", "ajout à trainer_emails : compte promu");
await as(C, "claire@exemple.fr");
ok((await db.query(`select public.claim_trainer() ok`)).rows[0].ok === true, "claim_trainer reconnaît le formateur");
await db.query(`select public.set_trainer_code('Nouveau-2026')`);
await db.exec(`reset role; set role anon;`);
ok((await db.query(`select public.check_trainer_code('Nouveau-2026') ok`)).rows[0].ok === true, "code choisi après première connexion");
await as(B, "bob@exemple.fr");
ok((await db.query(`select public.claim_trainer() ok`)).rows[0].ok === false, "un stagiaire ne se promeut pas");
ok((await db.query(`select email from profiles`)).rows.length === 1, "sans droits par défaut : un·e stagiaire lit son profil et lui seul");
await fails(`select * from trainer_emails`, "liste des formateurs illisible");

// Habillages et conducteur
await as(T, "formateur@exemple.fr");
const sk = (await db.query(`insert into skins (name, accent) values ('INA', '#e4002b') returning id`)).rows[0].id;
await fails(`insert into skins (name, accent) values ('Mauvais', 'rouge')`, "couleur d'accent invalide refusée");
await db.exec(`update sessions set skin_id = '${sk}', programme = '{"modules":[{"id":"x","t":["09:00","10:00"],"type":"pratique","titre":"Atelier","day":1}],"nDays":1}'::jsonb, status = 'live' where code = '${code}'`);
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='{"role":"anon"}'; set role anon;`);
const pubSk = (await db.query(`select skin_name, skin_accent from public.session_public('${code}')`)).rows[0];
ok(pubSk?.skin_name === "INA" && pubSk.skin_accent === "#e4002b", "habillage transmis à l'entrée stagiaire sans connexion");
await fails(`select * from skins`, "habillages illisibles sans connexion");
await as(B, "bob@exemple.fr");
ok((await db.query(`select name from skins`)).rows.length === 1, "un·e stagiaire lit les habillages (pour l'affichage)");
await fails(`insert into skins (name) values ('Pirate')`, "un·e stagiaire ne crée pas d'habillage");
await as(T, "formateur@exemple.fr");
const dupId = (await db.query(`select public.duplicate_session((select id from sessions where code = '${code}')) id`)).rows[0].id;
const dupS = (await db.query(`select skin_id, programme->'modules'->0->>'titre' t from sessions where id = '${dupId}'`)).rows[0];
ok(dupS.skin_id === sk && dupS.t === "Atelier", "duplication : habillage et conducteur repris");
await db.exec(`delete from skins where id = '${sk}'`);
ok((await db.query(`select skin_id from sessions where code = '${code}'`)).rows[0].skin_id === null, "habillage supprimé : la session revient au défaut");

// Rôles : un·e formateur·ice ne voit que les sessions qui lui sont attribuées
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
const F = "00000000-0000-0000-0000-00000000000f";
await db.exec(`insert into trainer_emails (email) values ('fanny@exemple.fr'); insert into auth.users (id,email) values ('${F}','fanny@exemple.fr');`);
ok((await db.query(`select role from profiles where id='${F}'`)).rows[0].role === "trainer", "compte formateur·ice (non admin)");
await as(T, "formateur@exemple.fr");
const fc = (await db.query(`insert into trainers (name, login_email) values ('Fanny', 'fanny@exemple.fr') returning id`)).rows[0].id;
const s2 = (await db.query(`insert into sessions (title) values ('Session de Fanny') returning id`)).rows[0].id;
await db.exec(`update sessions set trainer_id = '${fc}' where id = '${s2}'`);
ok((await db.query(`select email from public.list_staff()`)).rows.length >= 2, "l'admin liste l'équipe");
await as(F, "fanny@exemple.fr");
const visible = (await db.query(`select id from sessions`)).rows.map((r) => r.id);
ok(visible.length === 1 && visible[0] === s2, "la formatrice ne voit que sa session");
await db.exec(`update sessions set title = 'Session de Fanny (modifiée)' where id = '${s2}'`);
ok((await db.query(`select title from sessions where id='${s2}'`)).rows[0].title.includes("modifiée"), "elle modifie sa session");
await fails(`update sessions set trainer_id = null where id = '${s2}'`, "elle ne change pas l'attribution");
await fails(`insert into sessions (title) values ('Pirate')`, "elle ne crée pas de session");
await fails(`select public.session_roster('${sid}')`, "pas de tableau des participant·es d'une autre session");
await fails(`select public.list_staff()`, "pas d'accès à la liste de l'équipe");
await fails(`insert into brands (name) values ('Pirate')`, "pas de réglages communs");
ok((await db.query(`select count(*)::int n from public.session_roster('${s2}')`)).rows[0].n === 0, "tableau de sa propre session");
await as(T, "formateur@exemple.fr");
await fails(`select public.remove_staff('formateur@exemple.fr')`, "l'admin ne se retire pas lui-même");
await db.exec(`select public.save_staff('fanny@exemple.fr', true)`);
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
ok((await db.query(`select role from profiles where id='${F}'`)).rows[0].role === "admin", "promotion admin");
await as(T, "formateur@exemple.fr");
await db.exec(`select public.remove_staff('fanny@exemple.fr')`);
await db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
ok((await db.query(`select role from profiles where id='${F}'`)).rows[0].role === "trainee", "accès retiré : redevient stagiaire");

// Anonyme : rien
await db.exec(`reset role; set test.uid=''; set role anon;`);
await fails(`select public.join_session('${code}')`, "un visiteur non connecté ne peut rien rejoindre");
console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests SQL passent.");
