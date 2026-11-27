// Test du schéma Supabase dans un Postgres embarqué (PGlite).
// On simule le schéma `auth` de Supabase, puis on vérifie les droits :
// un·e stagiaire ne voit ni les autres cadrages ni les réponses nominatives,
// ne peut pas se promouvoir formateur, ne peut pas s'auto-émarger.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

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
// Toutes les migrations, dans l'ordre de leur nom (plus de liste à tenir à jour)
const MIGRATIONS = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
for (const f of MIGRATIONS) {
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
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(code), "code de session généré, 8 caractères sans ambiguïté : " + code);
await db.exec(`insert into session_invites values ('${sid}','alice@exemple.fr'); insert into resources (session_id,title,url) values ('${sid}','Charte','https://exemple.fr')`);
await db.exec(`update sessions set status='live', online = true where id='${sid}'`); // en ligne : discussion ouverte aux stagiaires

// Alice : réclame son invitation, cadre son projet, répond
await as(A, "alice@exemple.fr");
ok((await db.query(`select public.claim_invites() n`)).rows[0].n === 1, "invitation rattachée");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 1, "Alice voit sa session");
ok((await db.query(`select count(*)::int n from resources`)).rows[0].n === 1, "Alice voit les ressources");
await db.exec(`insert into projects (session_id, data) values ('${sid}', '{"retenu":{"titre":"Veille municipale"},"steps":["profil"]}')`);
await db.exec(`select public.submit_response('${sid}', 'niveau', '1'::jsonb)`);
await db.exec(`select public.submit_response('${sid}', 'niveau', '2'::jsonb)`);
ok((await db.query(`select value from responses where activity_id='niveau'`)).rows[0].value === 2, "réponse enregistrée puis modifiée (submit_response)");
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
await db.exec(`select public.submit_response('${sid}', 'niveau', '2'::jsonb)`);
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
await db.exec(`insert into session_secrets (session_id, label, value) values ('${sid}', 'Compte Gemini', 'mdp-123')`);
const dup2 = (await db.query(`select public.duplicate_session('${sid}', 'Libération · mars', '2027-03-04', null, true, true) id`)).rows[0].id;
const d2 = (await db.query(`select title, date::text d, status, code <> '${code}' newcode from sessions where id='${dup2}'`)).rows[0];
ok(d2.title === "Libération · mars" && d2.d === "2027-03-04" && d2.status === "draft" && d2.newcode, "duplication : intitulé, date, brouillon, nouveau code");
const inv2 = (await db.query(`select email from session_invites where session_id='${dup2}' order by email`)).rows.map((r) => r.email).join(",");
ok(inv2 === "alice@exemple.fr,bob@exemple.fr", "duplication : stagiaires repris en invitations (" + inv2 + ")");
ok((await db.query(`select value from session_secrets where session_id='${dup2}'`)).rows[0].value === "mdp-123", "duplication : valeurs des codes recopiées sur demande");
ok((await db.query(`select count(*)::int n from session_members where session_id='${dup2}'`)).rows[0].n === 0, "duplication : aucun·e participant·e, aucune réponse");
ok((await db.query(`select value from session_secrets where session_id='${dup.rows[0].id}'`)).rows.every((r) => r.value === ""), "duplication par défaut : codes vidés");
await db.exec(`update sessions set skip_pages = '5, 12 à 14' where id = '${sid}'`);
const dup3 = (await db.query(`select public.duplicate_session('${sid}') id`)).rows[0].id;
ok((await db.query(`select skip_pages from sessions where id='${dup3}'`)).rows[0].skip_pages === "5, 12 à 14", "duplication : pages masquées reprises");
await db.exec(`delete from sessions where id = '${dup3}'`);

// v3 : support, logos, codes, page publique
await db.exec(`reset role; update sessions set date = current_date + 1, end_time = '23:59', format = '1' where id = '${sid}';
  insert into session_support values ('${sid}', 'https://drive.google.com/support.pdf');
  insert into access_codes (session_id, email, code_hash, expires_at) values ('${sid}', 'bob@exemple.fr', 'x', now() + interval '1 day');
  insert into access_passes (session_id, email, expires_at) values ('${sid}', 'bob@exemple.fr', now() + interval '1 day'), ('${sid}', 'vieux@exemple.fr', now() - interval '1 hour');
  select public.purge_access_codes();`);
ok((await db.query(`select string_agg(email, ',' order by email) e from access_passes`)).rows[0].e === "bob@exemple.fr", "purge : accès direct périmé effacé, l'autre gardé");
await as(B, "bob@exemple.fr");
let st = (await db.query(`select * from public.support_status('${sid}')`)).rows[0];
ok(st.unlocked === false && st.url === null && st.configured === true, "support verrouillé : lien masqué au stagiaire");
ok((await db.query(`select count(*)::int n from session_support`)).rows[0].n === 0, "le stagiaire ne lit pas la table du support");
await fails(`select * from access_codes`, "les codes d'accès sont illisibles côté client");
await fails(`select * from access_passes`, "les accès directs sont illisibles côté client");
await fails(`insert into access_passes (session_id, email, expires_at) values ('${sid}', 'pirate@exemple.fr', now() + interval '1 day')`, "un client ne s'accorde pas d'accès direct");
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
// Messagerie : le badge « équipe » est posé par le serveur, jamais par le client
await as(B, "bob@exemple.fr");
const tid = (await db.query(`select id from threads limit 1`)).rows[0].id;
await fails(`insert into posts (thread_id, session_id, body, staff) values ('${tid}', '${sid}', 'Je me fais passer pour l''équipe', true)`, "un stagiaire ne peut pas fournir lui-même le badge équipe");
await db.exec(`insert into posts (thread_id, session_id, body) values ('${tid}', '${sid}', 'Question de Bob')`);
ok((await db.query(`select staff from posts where author='${B}'`)).rows[0].staff === false, "message de stagiaire non marqué équipe");
await as(T, "formateur@exemple.fr");
await db.exec(`insert into posts (thread_id, session_id, body) values ('${tid}', '${sid}', 'Réponse du formateur')`);
ok((await db.query(`select staff from posts where author='${T}'`)).rows[0].staff === true, "message du formateur marqué équipe");
await db.exec(`update sessions set online = true where id = '${sid}'`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select online from sessions`)).rows[0].online === true, "le stagiaire lit le mode en ligne");
await db.exec(`update sessions set online = false`);
await as(T, "formateur@exemple.fr");
ok((await db.query(`select online from sessions where id='${sid}'`)).rows[0].online === true, "le stagiaire ne change pas le mode en ligne");
await as(B, "bob@exemple.fr");
await db.exec(`update sessions set skip_pages = '' where id = '${sid}'`);
await as(T, "formateur@exemple.fr");
ok((await db.query(`select skip_pages from sessions where id='${sid}'`)).rows[0].skip_pages === "5, 12 à 14", "le stagiaire ne change pas les pages masquées");
// Formation en salle (online = false) : la discussion est fermée aux stagiaires, l'équipe la garde
await db.exec(`update sessions set online = false where id = '${sid}'`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from threads`)).rows[0].n === 0, "formation en salle : le stagiaire ne lit pas la discussion");
ok((await db.query(`select count(*)::int n from posts`)).rows[0].n === 0, "formation en salle : le stagiaire ne lit pas les messages");
await fails(`insert into posts (thread_id, session_id, body) values ('${tid}', '${sid}', 'en salle')`, "formation en salle : le stagiaire n'écrit pas");
await fails(`insert into threads (session_id, title) values ('${sid}', 'Nouvelle conversation')`, "formation en salle : le stagiaire n'ouvre pas de conversation");
await as(T, "formateur@exemple.fr");
ok((await db.query(`select count(*)::int n from posts where session_id='${sid}'`)).rows[0].n === 2, "formation en salle : l'équipe lit la discussion");
await db.exec(`insert into posts (thread_id, session_id, body) values ('${tid}', '${sid}', 'Note de l''équipe')`);
await db.exec(`update sessions set online = true where id = '${sid}'`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from posts`)).rows[0].n === 3, "formation en ligne réactivée : le stagiaire relit tous les messages");
await as(T, "formateur@exemple.fr");
await db.exec(`update sessions set status = 'closed' where id = '${sid}'`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from threads`)).rows[0].n === 0, "session close : le stagiaire ne lit plus la discussion");
ok((await db.query(`select count(*)::int n from resources`)).rows[0].n === 1, "session close : le stagiaire garde les ressources");
await fails(`insert into posts (thread_id, session_id, body) values ('${tid}', '${sid}', 'encore là')`, "session close : le stagiaire n'écrit plus");
await as(T, "formateur@exemple.fr");
ok((await db.query(`select count(*)::int n from posts where session_id='${sid}'`)).rows[0].n === 3, "session close : l'équipe relit la discussion");
await as(B, "bob@exemple.fr");
await db.exec(`delete from threads where session_id = '${sid}'`);
await as(T, "formateur@exemple.fr");
ok((await db.query(`select count(*)::int n from threads where session_id='${sid}'`)).rows[0].n === 1, "un stagiaire n'efface pas la discussion");
await db.exec(`delete from threads where session_id = '${sid}'`);
ok((await db.query(`select count(*)::int n from posts where session_id='${sid}'`)).rows[0].n === 0, "l'équipe efface toute la discussion (messages compris)");
await db.exec(`reset role;`);
ok((await db.query(`select count(*)::int n from access_codes where session_id='${sid}'`)).rows[0].n === 0, "codes détruits à la clôture");
ok((await db.query(`select count(*)::int n from access_passes where session_id='${sid}'`)).rows[0].n === 0, "accès directs détruits à la clôture");
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
// Code sans e-mail (fonction access, action issue) : autorisé par manages(), appelé avec le jeton de la personne connectée
ok((await db.query(`select public.manages('${s2}') m`)).rows[0].m === true, "code sans e-mail : la formatrice peut en générer pour sa session");
ok((await db.query(`select public.manages('${sid}') m`)).rows[0].m === false, "code sans e-mail : pas pour une session qui ne lui est pas attribuée");
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

/* ---------- Durcissement (phase 0) ---------- */
const su = () => db.exec(`reset role; set test.uid=''; set request.jwt.claims='';`);
await su();
// Droits d'exécution : liste blanche sans connexion, fonctions internes fermées aux comptes
const anonFns = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((r) => r.proname).join(",");
ok(anonFns === "check_trainer_code,session_public,trainer_code_configured", "sans connexion, trois fonctions seulement : " + anonFns);
const authFns = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('staff_role','throttle_hit','try_access_code','purge_access_codes')
  and has_function_privilege('authenticated', p.oid, 'execute')`)).rows.map((r) => r.proname);
ok(authFns.length === 0, "fonctions internes fermées aux comptes connectés" + (authFns.length ? " : " + authFns.join(",") : ""));
// Limites anti-abus
const th = [];
for (let i = 0; i < 3; i++) th.push((await db.query(`select public.throttle_hit('test', 2, 60) ok`)).rows[0].ok);
ok(th.join() === "true,true,false", "limite : deux appels passent, le troisième est refusé");
// Essais de code atomiques
const S3 = (await db.query(`insert into sessions (title, status) values ('Durcissement', 'draft') returning id, code`)).rows[0];
await db.exec(`insert into access_codes (session_id, email, code_hash, expires_at) values ('${S3.id}', 'carla@exemple.fr', 'bon', now() + interval '1 day')`);
const tr = async (h) => (await db.query(`select public.try_access_code('${S3.id}', 'carla@exemple.fr', '${h}') r`)).rows[0].r;
ok(await tr("faux") === "bad:7", "code faux : un essai de moins");
ok(await tr("bon") === "ok", "bon code accepté, compteur remis à zéro");
for (let i = 0; i < 8; i++) await tr("faux");
ok(await tr("bon") === "locked", "après huit essais faux, même le bon code est bloqué");
ok((await db.query(`select public.try_access_code('${S3.id}', 'inconnu@exemple.fr', 'x') r`)).rows[0].r === "none", "adresse sans code : aucun");
// Mode « sur invitation » : join_session renvoie null (sans exception) pour une personne non invitée
await db.exec(`update sessions set access_mode = 'invites' where id = '${S3.id}'`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select public.join_session('${S3.code}') r`)).rows[0].r === null, "session sur invitation : Bob, non invité, n'entre pas");
await as(T, "formateur@exemple.fr");
await db.exec(`insert into session_invites (session_id, email) values ('${S3.id}', 'bob@exemple.fr')`);
await as(B, "bob@exemple.fr");
ok((await db.query(`select public.join_session('${S3.code}') r`)).rows[0].r === S3.id, "une fois invité, Bob entre");
ok((await db.query(`select public.join_session('ZZZZZZZZ') r`)).rows[0].r === null, "code inconnu : null, pas d'erreur");
// Réponses : seulement salle ouverte, seulement par submit_response
await fails(`select public.submit_response('${S3.id}', 'niveau', '1'::jsonb)`, "salle fermée : pas de réponse");
await as(T, "formateur@exemple.fr");
await db.exec(`update sessions set status = 'live', online = true where id = '${S3.id}'`);
await db.exec(`insert into session_secrets (session_id, label, value) values ('${S3.id}', 'Compte test', 'secret-42')`);
await as(B, "bob@exemple.fr");
await db.exec(`select public.submit_response('${S3.id}', 'niveau', '1'::jsonb)`);
ok((await db.query(`select count(*)::int n from responses where session_id='${S3.id}'`)).rows[0].n === 1, "salle ouverte : réponse enregistrée");
await fails(`insert into responses (session_id, activity_id, value) values ('${S3.id}', 'triche', '1'::jsonb)`, "pas d'écriture directe dans les réponses");
await fails(`update responses set value = '3'::jsonb where session_id = '${S3.id}'`, "pas de modification directe des réponses");
ok((await db.query(`select count(*)::int n from session_secrets where session_id='${S3.id}'`)).rows[0].n === 1, "session ouverte : Bob lit les codes d'exercice");
// Discussion : un stagiaire ne supprime pas une conversation ; pas de message vers le fil d'une autre session
await db.exec(`insert into threads (session_id, title) values ('${S3.id}', 'Général')`);
await db.exec(`delete from threads where session_id = '${S3.id}'`);
ok((await db.query(`select count(*)::int n from threads where session_id='${S3.id}'`)).rows[0].n === 1, "un stagiaire ne supprime pas une conversation, même la sienne");
await as(T, "formateur@exemple.fr");
const th3 = (await db.query(`select id from threads where session_id='${S3.id}'`)).rows[0].id;
await fails(`insert into posts (thread_id, session_id, body) values ('${th3}', '${sid}', 'mauvaise session')`, "message vers le fil d'une autre session refusé");
// Clôture : codes d'exercice masqués aux stagiaires, visibles pour l'équipe
await db.exec(`update sessions set status = 'closed' where id = '${S3.id}'`);
ok((await db.query(`select count(*)::int n from session_secrets where session_id='${S3.id}'`)).rows[0].n === 1, "session close : l'équipe garde les codes d'exercice");
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from session_secrets where session_id='${S3.id}'`)).rows[0].n === 0, "session close : Bob ne lit plus les codes d'exercice");
// Équipe : adresses de connexion illisibles pour un·e stagiaire
await fails(`select login_email from trainers`, "un stagiaire ne lit pas les adresses de connexion de l'équipe");
ok((await db.query(`select count(*)::int n from trainers`)).rows[0].n >= 1, "il lit toujours les fiches des intervenant·es");
ok((await db.query(`select count(*)::int n from public.trainer_logins()`)).rows[0].n === 0, "trainer_logins vide pour un stagiaire");
ok((await db.query(`select public.manages('${sid}') m`)).rows[0].m === false, "code sans e-mail : refusé à un stagiaire");
await as(T, "formateur@exemple.fr");
ok((await db.query(`select count(*)::int n from public.trainer_logins() where login_email is not null`)).rows[0].n >= 1, "l'équipe lit les adresses de connexion");
// Contraintes et duplication
await fails(`update sessions set emargement_url = 'javascript:alert(1)' where id = '${S3.id}'`, "lien d'émargement javascript: refusé");
await fails(`update sessions set emargement_qr = 'javascript:alert(1)' where id = '${S3.id}'`, "QR d'émargement hors image refusé");
await db.exec(`update sessions set emargement_qr = 'data:image/png;base64,AAAA' where id = '${S3.id}'`);
const d4 = (await db.query(`select public.duplicate_session('${S3.id}') id`)).rows[0].id;
ok((await db.query(`select access_mode from sessions where id='${d4}'`)).rows[0].access_mode === "invites", "la duplication reprend le mode d'accès");
// Bibliothèque « Quiz et sondages » : lue par l'équipe, modifiée par l'administration, fermée aux stagiaires
await su();
const F2 = "00000000-0000-0000-0000-0000000000f2";
await db.exec(`insert into trainer_emails (email, is_admin) values ('form2@exemple.fr', false) on conflict do nothing;
insert into auth.users (id,email) values ('${F2}','form2@exemple.fr') on conflict do nothing;`);
ok((await db.query(`select count(*)::int n from quiz_bank`)).rows[0].n === 16, "bibliothèque : 7 quiz et 9 sondages repris de data.js");
ok((await db.query(`select content->'questions'->0->>'id' i from quiz_bank where id = 'llm'`)).rows[0].i === "0", "bibliothèque : questions reprises avec leur rang comme identifiant");
ok(!(await db.query(`select has_table_privilege('anon', 'public.quiz_bank', 'select') p`)).rows[0].p, "bibliothèque : rien pour anon");
await as(B, "bob@exemple.fr");
ok((await db.query(`select count(*)::int n from quiz_bank`)).rows[0].n === 0, "bibliothèque : un·e stagiaire ne lit rien");
await fails(`insert into quiz_bank (id, kind, titre, content) values ('pirate', 'cloud', 'Pirate', '{"q":"?"}')`, "bibliothèque : un·e stagiaire n'ajoute rien");
await as(F2, "form2@exemple.fr");
ok((await db.query(`select count(*)::int n from quiz_bank`)).rows[0].n === 16, "bibliothèque : un formateur la lit");
await fails(`insert into quiz_bank (id, kind, titre, content) values ('perso', 'cloud', 'Perso', '{"q":"?"}')`, "bibliothèque : un formateur n'ajoute rien");
await db.exec(`update quiz_bank set titre = 'Changé' where id = 'llm'`);
await db.exec(`delete from quiz_bank where id = 'llm'`);
await as(T, "formateur@exemple.fr");
ok((await db.query(`select titre from quiz_bank where id = 'llm'`)).rows[0]?.titre === "Comprendre la machine", "bibliothèque : un formateur ne modifie ni ne supprime rien");
await db.exec(`insert into quiz_bank (id, kind, titre, content) values ('nouveau-ab12', 'quiz', 'Nouveau', '{"questions":[{"id":"q-abc123","q":"?","o":["a","b"],"ok":0,"why":""}]}')`);
await db.exec(`update quiz_bank set titre = 'Nouveau titre', updated_at = '2000-01-01' where id = 'nouveau-ab12'`);
const nb = (await db.query(`select titre, updated_by, updated_at > now() - interval '1 minute' recent from quiz_bank where id = 'nouveau-ab12'`)).rows[0];
ok(nb.titre === "Nouveau titre" && nb.updated_by === T && nb.recent, "bibliothèque : l'admin modifie, date et auteur tenus par le déclencheur");
await db.exec(`delete from quiz_bank where id = 'nouveau-ab12'`);
ok((await db.query(`select count(*)::int n from quiz_bank where id = 'nouveau-ab12'`)).rows[0].n === 0, "bibliothèque : l'admin supprime");
await fails(`insert into quiz_bank (id, kind, titre, content) values ('Mauvais Id', 'cloud', 'X', '{"q":"?"}')`, "bibliothèque : identifiant hors format refusé");
await fails(`insert into quiz_bank (id, kind, titre, content) values ('genre', 'texte', 'X', '{"q":"?"}')`, "bibliothèque : type inconnu refusé");
await fails(`insert into quiz_bank (id, kind, titre, content) values ('lourd', 'cloud', 'X', jsonb_build_object('q', repeat(md5(random()::text), 4000)))`, "bibliothèque : contenu de plus de 100 ko refusé");
// Copie des quiz dans la session
ok(JSON.stringify((await db.query(`select quizzes from sessions where id='${S3.id}'`)).rows[0].quizzes) === "{}", "session : aucun quiz copié par défaut");
await fails(`update sessions set quizzes = '[]'::jsonb where id = '${S3.id}'`, "session : quizzes doit être un objet");
await db.exec(`update sessions set quizzes = '{"llm":{"titre":"Copie","questions":[{"id":"0","q":"?","o":["a","b"],"ok":1,"why":""}],"from":"llm"}}' where id = '${S3.id}'`);
const d5 = (await db.query(`select public.duplicate_session('${S3.id}') id`)).rows[0].id;
ok((await db.query(`select quizzes->'llm'->>'titre' t from sessions where id='${d5}'`)).rows[0].t === "Copie", "la duplication reprend les quiz de la session");

/* ---------- Mode invitation : deux sessions de démo à manipuler, rien d'autre, date de fin ---------- */
const G = "00000000-0000-0000-0000-0000000000e1", G2 = "00000000-0000-0000-0000-0000000000e2";
await as(T, "formateur@exemple.fr");
const S4 = (await db.query(`insert into sessions (title, status, online) values ('Vraie session', 'live', true) returning id, code`)).rows[0];
await db.exec(`insert into session_invites (session_id, email) values ('${S4.id}', 'invite@exemple.fr');
  insert into resources (session_id, title, url) values ('${S4.id}', 'Charte', 'https://exemple.fr')`);
await db.exec(`select public.save_staff('invite@exemple.fr', 'guest', current_date + 10); select public.save_staff('autre.invite@exemple.fr', 'guest', current_date + 10)`);
const team = (await db.query(`select role, guest_until is not null u from public.list_team() where email = 'invite@exemple.fr'`)).rows[0];
ok(team?.role === "guest" && team.u, "équipe : invité·e déclaré·e avec une date de fin");
ok((await db.query(`select is_admin from public.list_staff() where email = 'invite@exemple.fr'`)).rows[0]?.is_admin === false, "équipe : l'ancienne liste reste lisible");
await fails(`select public.save_staff('x@exemple.fr', 'chef', null)`, "équipe : rôle inconnu refusé");
await as(B, "bob@exemple.fr");
await db.query(`select public.join_session('${S4.code}')`);
await db.exec(`insert into threads (session_id, title) values ('${S4.id}', 'Général')`);
const t4 = (await db.query(`select id from threads where session_id = '${S4.id}'`)).rows[0].id;
await su();
await db.exec(`insert into auth.users (id, email) values ('${G}', 'Invite@exemple.fr'), ('${G2}', 'autre.invite@exemple.fr')`);
ok((await db.query(`select role from profiles where id = '${G}'`)).rows[0].role === "guest", "invité·e : rôle posé à la création du compte");
await as(G, "invite@exemple.fr");
ok((await db.query(`select public.claim_invites() n`)).rows[0].n === 0, "invité·e : une invitation à une session ne l'y inscrit pas");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 0, "invité·e : ne voit aucune vraie session");
await fails(`insert into sessions (title) values ('Pirate')`, "invité·e : ne crée pas de vraie session");
await fails(`insert into sessions (title, demo_owner) values ('Pour un autre', '${G2}')`, "invité·e : ne crée pas de démo pour quelqu'un d'autre");
const D1 = (await db.query(`insert into sessions (title, format, demo_owner) values ('Démo · une journée', '1', '${G}') returning id`)).rows[0].id;
const D2 = (await db.query(`insert into sessions (title, format, date2, demo_owner) values ('Démo · deux journées', '2', current_date + 1, '${G}') returning id`)).rows[0].id;
await fails(`insert into sessions (title, demo_owner) values ('Une troisième', '${G}')`, "invité·e : deux sessions de démo au plus");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 2, "invité·e : voit ses deux sessions de démo");
await db.exec(`update sessions set title = 'Ma démo', status = 'live', live = '{"view":"title"}' where id = '${D1}'`);
ok((await db.query(`select title from sessions where id = '${D1}'`)).rows[0].title === "Ma démo", "invité·e : pilote sa démo (réglages, salle, écran)");
await db.exec(`insert into resources (session_id, title, url) values ('${D1}', 'Ressource de démo', 'https://exemple.fr')`);
ok((await db.query(`select count(*)::int n from resources where session_id = '${D1}'`)).rows[0].n === 1, "invité·e : ajoute une ressource à sa démo");
ok((await db.query(`select count(*)::int n from public.session_roster('${D1}')`)).rows[0].n === 0, "invité·e : tableau des participant·es de sa démo");
await fails(`update sessions set demo_owner = null where id = '${D1}'`, "invité·e : sa démo ne devient pas une vraie session");
await fails(`update sessions set trainer_id = (select id from trainers limit 1) where id = '${D1}'`, "invité·e : n'attribue pas sa démo");
await fails(`select public.session_roster('${S4.id}')`, "invité·e : pas de participant·es d'une vraie session");
ok((await db.query(`select count(*)::int n from resources where session_id = '${S4.id}'`)).rows[0].n === 0, "invité·e : pas de ressources d'une vraie session");
ok((await db.query(`select count(*)::int n from threads`)).rows[0].n === 0, "invité·e : pas de discussion d'une vraie session");
await db.exec(`update sessions set title = 'Piratée' where id = '${S4.id}'`);
ok((await db.query(`select public.join_session('${S4.code}') r`)).rows[0].r === null, "invité·e : ne rejoint aucune session par code");
await fails(`select public.set_trainer_code('nouveau-code-123')`, "invité·e : ne change pas le code formateur");
await fails(`select public.list_team()`, "invité·e : pas de liste de l'équipe");
await fails(`select public.save_staff('moi@exemple.fr', 'admin', null)`, "invité·e : ne se donne aucun rôle");
await fails(`select public.duplicate_session('${D1}')`, "invité·e : ne duplique pas, même sa démo");
await fails(`insert into posts (thread_id, session_id, body) values ('${t4}', '${S4.id}', 'Pirate')`, "invité·e : n'écrit pas dans une vraie discussion");
ok((await db.query(`select count(*)::int n from quiz_bank`)).rows[0].n > 0, "invité·e : bibliothèque de quiz lisible");
ok((await db.query(`select active from public.guest_status()`)).rows[0]?.active === true, "invité·e : accès en cours");
await as(G2, "autre.invite@exemple.fr");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 0, "invité·e : ne voit pas les démos d'un·e autre invité·e");
await db.exec(`update sessions set title = 'Chez l''autre' where id = '${D1}'`);
await as(T, "formateur@exemple.fr");
ok((await db.query(`select title from sessions where id = '${S4.id}'`)).rows[0].title === "Vraie session", "invité·e : ne modifie pas une vraie session");
ok((await db.query(`select title from sessions where id = '${D1}'`)).rows[0].title === "Ma démo", "invité·e : ne modifie pas la démo d'un·e autre");
ok((await db.query(`select count(*)::int n from sessions where demo_owner = '${G}'`)).rows[0].n === 2, "l'administration voit les démos (le site les écarte de la liste)");
await as(G, "invite@exemple.fr");
await db.exec(`delete from sessions where id = '${D2}'`);
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 1, "invité·e : supprime sa démo (remise à zéro)");
// Date de fin passée : plus rien de visible, même connecté·e
await su();
await db.exec(`update trainer_emails set guest_until = current_date - 1 where email = 'invite@exemple.fr'`);
await as(G, "invite@exemple.fr");
ok((await db.query(`select count(*)::int n from sessions`)).rows[0].n === 0, "invité·e : accès expiré, sa démo n'est plus visible");
await db.exec(`update sessions set title = 'Après la fin' where id = '${D1}'`);
ok((await db.query(`select active from public.guest_status()`)).rows[0]?.active === false, "invité·e : le bandeau sait que l'accès a pris fin");
// Un·e stagiaire devenu·e invité·e perd ses droits d'écriture de participant·e
await as(T, "formateur@exemple.fr");
ok((await db.query(`select title from sessions where id = '${D1}'`)).rows[0].title === "Ma démo", "invité·e : accès expiré, ne modifie plus sa démo");
await db.exec(`select public.save_staff('bob@exemple.fr', 'guest', current_date + 5)`);
await as(B, "bob@exemple.fr");
await fails(`insert into posts (thread_id, session_id, body) values ('${t4}', '${S4.id}', 'Encore moi')`, "stagiaire devenu·e invité·e : n'écrit plus");
await as(T, "formateur@exemple.fr");
await db.exec(`select public.remove_staff('bob@exemple.fr'); select public.remove_staff('invite@exemple.fr'); select public.remove_staff('autre.invite@exemple.fr')`);
ok((await db.query(`select count(*)::int n from sessions where demo_owner = '${G}'`)).rows[0].n === 0, "accès invité·e retiré : ses démos partent avec");
await su();
ok((await db.query(`select string_agg(role, ',' order by email) r from profiles where id in ('${B}', '${G}')`)).rows[0].r === "trainee,trainee", "accès invité·e retiré : redevient stagiaire");

/* ---------- Archivage : 5 jours après le dernier jour, plus rien pour les stagiaires ---------- */
await as(T, "formateur@exemple.fr");
const SA = (await db.query(`insert into sessions (title, status, date, format) values ('Archivée', 'draft', current_date - 10, '1') returning id, code`)).rows[0];
const SR = (await db.query(`insert into sessions (title, status, date, format) values ('Récente', 'draft', current_date - 2, '1') returning id, code`)).rows[0];
const S2J = (await db.query(`insert into sessions (title, status, date, date2, format) values ('Deux jours', 'draft', current_date - 9, current_date - 2, '2') returning id`)).rows[0];
await db.exec(`insert into resources (session_id, title, url) values ('${SA.id}', 'Vieille charte', 'https://exemple.fr'), ('${SR.id}', 'Charte', 'https://exemple.fr');
  insert into session_secrets (session_id, label, value) values ('${SA.id}', 'Compte', 'ancien');
  insert into threads (session_id, title) values ('${SA.id}', 'Général');
  insert into session_support values ('${SA.id}', 'https://drive.google.com/vieux.pdf');
  update sessions set support_unlocked = true where id = '${SA.id}'`);
ok((await db.query(`select public.session_archived('${SA.id}') a, public.session_archived('${SR.id}') r, public.session_archived('${S2J.id}') d`)).rows.map((x) => [x.a, x.r, x.d].join()).join() === "true,false,false", "archivage : 5 jours après le dernier jour (jour 2 compris)");
await as(B, "bob@exemple.fr");
await db.query(`select public.join_session('${SA.code}')`); await db.query(`select public.join_session('${SR.code}')`);
ok((await db.query(`select count(*)::int n from sessions where id in ('${SA.id}', '${SR.id}')`)).rows[0].n === 2, "archivage : le stagiaire lit encore la session (pour afficher « Session archivée »)");
ok((await db.query(`select count(*)::int n from resources where session_id = '${SA.id}'`)).rows[0].n === 0, "archivage : ressources fermées au stagiaire");
ok((await db.query(`select count(*)::int n from resources where session_id = '${SR.id}'`)).rows[0].n === 1, "terminée depuis 2 jours : ressources encore ouvertes");
ok((await db.query(`select count(*)::int n from session_secrets where session_id = '${SA.id}'`)).rows[0].n === 0, "archivage : codes d'exercice fermés");
ok((await db.query(`select count(*)::int n from threads where session_id = '${SA.id}'`)).rows[0].n === 0, "archivage : discussion fermée");
await fails(`insert into threads (session_id, title) values ('${SA.id}', 'Encore là')`, "archivage : le stagiaire n'écrit plus");
await fails(`insert into projects (session_id, data) values ('${SA.id}', '{}')`, "archivage : le stagiaire ne crée plus de cadrage");
const sup = (await db.query(`select * from public.support_status('${SA.id}')`)).rows[0];
ok(sup.unlocked === true && sup.url === null && sup.configured === true, "archivage : lien du support masqué au stagiaire");
await as(T, "formateur@exemple.fr");
ok((await db.query(`select count(*)::int n from resources where session_id = '${SA.id}'`)).rows[0].n === 1, "archivage : l'équipe garde les ressources");
ok((await db.query(`select url from public.support_status('${SA.id}')`)).rows[0].url.includes("vieux.pdf"), "archivage : l'équipe garde le lien du support");
ok((await db.query(`select count(*)::int n from threads where session_id = '${SA.id}'`)).rows[0].n === 1, "archivage : l'équipe garde la discussion");

/* ---------- Formations de 1 à 5 journées ---------- */
await as(T, "formateur@exemple.fr");
const S5 = (await db.query(`insert into sessions (title, format, date, date2, dates) values ('Cinq jours', '5', '2027-03-01', '2027-03-02', array['2027-03-01','2027-03-02','2027-03-08','2027-03-09','2027-03-15']::date[]) returning id, code`)).rows[0];
await fails(`insert into sessions (title, format) values ('Six jours', '6')`, "journées : six refusées");
await fails(`insert into sessions (title, format, dates) values ('Trop de dates', '5', array['2027-01-01','2027-01-02','2027-01-03','2027-01-04','2027-01-05','2027-01-06']::date[])`, "journées : six dates refusées");
ok((await db.query(`select public.session_last_day(s)::text d from sessions s where id = '${S5.id}'`)).rows[0].d === "2027-03-15", "journées : le dernier jour est la plus tardive des dates");
ok((await db.query(`select date2::text d from public.session_public('${S5.code}')`)).rows[0].d === "2027-03-15", "journées : l'entrée stagiaire reçoit le dernier jour");
const d6 = (await db.query(`select public.duplicate_session('${S5.id}', 'Cinq jours (bis)', '2027-04-05') id`)).rows[0].id;
const r6 = (await db.query(`select date::text d1, date2::text d2, array_to_string(dates, ',') ds, format from sessions where id = '${d6}'`)).rows[0];
ok(r6.ds === "2027-04-05,2027-04-06,2027-04-12,2027-04-13,2027-04-19" && r6.d2 === "2027-04-06" && r6.format === "5", "journées : la duplication décale toutes les dates du même écart");
const d7 = (await db.query(`select public.duplicate_session('${SR.id}', null, '2027-05-10') id`)).rows[0].id;
ok((await db.query(`select array_to_string(dates, ',') ds from sessions where id = '${d7}'`)).rows[0].ds === "2027-05-10", "journées : une journée dupliquée garde sa date");

/* ---------- Clôture automatique : 15 min après l'heure de fin, le dernier jour ---------- */
{
await as(T, "formateur@exemple.fr");
const F1 = (await db.query(`insert into sessions (title, status, date, format, end_time) values ('Finie hier', 'live', current_date - 1, '1', '17:30') returning id`)).rows[0].id;
const F2 = (await db.query(`insert into sessions (title, status, date, format, end_time) values ('Pas finie', 'live', current_date + 1, '1', '17:30') returning id`)).rows[0].id;
const F3 = (await db.query(`insert into sessions (title, status, date, date2, format, end_time) values ('Jour 2 demain', 'draft', current_date - 1, current_date + 1, '2', '17:30') returning id`)).rows[0].id;
const F4 = (await db.query(`insert into sessions (title, status, format) values ('Sans date', 'live', '1') returning id`)).rows[0].id;
await su();
await db.exec(`insert into access_codes (session_id, email, code_hash, expires_at) values ('${F1}', 'x@exemple.fr', 'h', now() + interval '1 day')`);
await as(B, "bob@exemple.fr");
const closedN = (await db.query(`select public.close_finished_sessions() n`)).rows[0].n;
await as(T, "formateur@exemple.fr");
const st = Object.fromEntries((await db.query(`select id, status from sessions where id in ('${F1}', '${F2}', '${F3}', '${F4}')`)).rows.map((r) => [r.id, r.status]));
ok(closedN >= 1 && st[F1] === "closed", "clôture automatique : session finie la veille close (appelable par tout compte connecté)");
ok(st[F2] === "live" && st[F3] === "draft" && st[F4] === "live", "clôture automatique : ni avant le dernier jour, ni sans date");
await su();
ok((await db.query(`select count(*)::int n from access_codes where session_id = '${F1}'`)).rows[0].n === 0, "clôture automatique : codes purgés comme à la main");
await db.exec(`reset role; set test.uid=''; set role anon;`);
await fails(`select public.close_finished_sessions()`, "clôture automatique : pas sans connexion");
await su();
}

/* ---------- Trames de conducteur : lecture équipe, écriture admin ---------- */
{
  await as(T, "formateur@exemple.fr");
  const tr1 = (await db.query(`insert into conducteur_templates (titre, content) values ('Une journée type', '{"nDays":1,"modules":[]}') returning id, updated_by`)).rows[0];
  ok(tr1.updated_by === T, "trames : l'admin crée, auteur tenu par la base");
  await db.exec(`update conducteur_templates set titre = 'Une journée type (v2)', updated_by = null where id = '${tr1.id}'`);
  ok((await db.query(`select titre, updated_by from conducteur_templates where id = '${tr1.id}'`)).rows[0].updated_by === T, "trames : l'admin modifie, auteur non falsifiable");
  await fails(`insert into conducteur_templates (titre, content) values ('', '{}')`, "trames : titre obligatoire");
  await fails(`insert into conducteur_templates (titre, content) values ('Liste', '[]')`, "trames : contenu en objet");
  await fails(`insert into conducteur_templates (titre, content) values ('Lourde', jsonb_build_object('x', repeat(md5(random()::text), 20000)))`, "trames : plus de 500 ko refusé");
  await as(F2, "form2@exemple.fr");
  ok((await db.query(`select count(*)::int n from conducteur_templates`)).rows[0].n === 1, "trames : un formateur les lit (pour les appliquer)");
  await fails(`insert into conducteur_templates (titre, content) values ('Perso', '{}')`, "trames : un formateur n'en crée pas");
  await db.exec(`update conducteur_templates set titre = 'Changée' where id = '${tr1.id}'`);
  await db.exec(`delete from conducteur_templates where id = '${tr1.id}'`);
  await as(B, "bob@exemple.fr");
  ok((await db.query(`select count(*)::int n from conducteur_templates`)).rows[0].n === 0, "trames : un·e stagiaire ne lit rien");
  await as(T, "formateur@exemple.fr");
  ok((await db.query(`select titre from conducteur_templates where id = '${tr1.id}'`)).rows[0]?.titre === "Une journée type (v2)", "trames : un formateur ne modifie ni ne supprime");
  await db.exec(`delete from conducteur_templates where id = '${tr1.id}'`);
  ok((await db.query(`select count(*)::int n from conducteur_templates`)).rows[0].n === 0, "trames : l'admin supprime");
  await su();
}

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests SQL passent.");
