-- =====================================================================
-- Quiz et sondages : bibliothèque partagée et copie figée dans chaque session.
-- - quiz_bank : modèles (quiz, sondages, nuages de mots), lus par l'équipe, modifiés par l'administration.
-- - sessions.quizzes : copie des quiz utilisés par la session ({ clé: { titre, questions, from } }).
--   Les sondages et nuages restent dans sessions.activities.
-- - duplicate_session reprend aussi les quiz de la session.
-- Rejouable sans erreur. À exécuter après 20261125000000_acces_direct.sql.
-- =====================================================================

-- 1. Bibliothèque
create table if not exists public.quiz_bank (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  kind        text not null check (kind in ('quiz', 'poll', 'cloud')),
  titre       text not null check (length(btrim(titre)) between 1 and 80),
  content     jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 100000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table public.quiz_bank enable row level security;
revoke all on public.quiz_bank from public, anon, authenticated;
grant select, insert, update, delete on public.quiz_bank to authenticated;
grant all on public.quiz_bank to service_role;
drop policy if exists "bibliothèque : lecture équipe" on public.quiz_bank;
create policy "bibliothèque : lecture équipe" on public.quiz_bank for select to authenticated using (public.is_trainer());
drop policy if exists "bibliothèque : ajout admin" on public.quiz_bank;
create policy "bibliothèque : ajout admin" on public.quiz_bank for insert to authenticated with check (public.is_admin());
drop policy if exists "bibliothèque : modification admin" on public.quiz_bank;
create policy "bibliothèque : modification admin" on public.quiz_bank for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bibliothèque : suppression admin" on public.quiz_bank;
create policy "bibliothèque : suppression admin" on public.quiz_bank for delete to authenticated using (public.is_admin());

-- Date et auteur de la dernière modification
create or replace function public.quiz_bank_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists quiz_bank_touch on public.quiz_bank;
create trigger quiz_bank_touch before update on public.quiz_bank for each row execute function public.quiz_bank_touch();
revoke execute on function public.quiz_bank_touch() from public, anon, authenticated; -- appelée par le déclencheur seulement

-- 2. Contenu de départ : les quiz et sondages écrits jusqu'ici dans data.js.
-- Bloc généré par scripts/seed-quiz-bank.mjs (vérifié par tests/quiz.test.mjs) : ne pas le modifier à la main.
-- >>> contenu repris de data.js
insert into public.quiz_bank (id, kind, titre, content) values
  ($qb$llm$qb$, $qb$quiz$qb$, $qb$Comprendre la machine$qb$, $qb${"questions":[{"id":"0","q":"Pendant le pré-entraînement, le modèle apprend…","o":["des faits vérifiés par des documentalistes","des régularités statistiques dans les textes","les règles de grammaire écrites par des linguistes","le contenu exact de chaque article lu"],"ok":1,"why":"Il apprend des régularités, pas des faits vérifiés : d'où des réponses fluides mais parfois fausses (p. 29)."},{"id":"1","q":"Que désigne RLHF ?","o":["Un format de fichier pour les prompts","L'apprentissage par renforcement à partir de retours humains","Un réglage de confidentialité","Un protocole pour brancher des outils"],"ok":1,"why":"Des personnes notent les réponses pour orienter le comportement du modèle. C'est là que se fixent ton et réflexes (p. 30)."},{"id":"2","q":"Qui fixe ce qu'un assistant accepte ou refuse de faire ?","o":["Une autorité publique internationale","Chaque entreprise, pour son modèle","L'utilisateur, dans ses réglages","Personne : c'est appris tout seul"],"ok":1,"why":"Les filtres sont fixés par chaque entreprise et diffèrent d'un assistant à l'autre (p. 31)."},{"id":"3","q":"L'IA générative est…","o":["toute l'intelligence artificielle","une branche parmi d'autres de l'IA","une technique apparue en 2022","un synonyme d'algorithme"],"ok":1,"why":"La plupart des systèmes d'IA en service ne génèrent rien : ils classent, prédisent, recommandent (p. 26)."}]}$qb$::jsonb),
  ($qb$redac$qb$, $qb$quiz$qb$, $qb$Ce qu'en font les rédactions$qb$, $qb${"questions":[{"id":"0","q":"Que font les « AI-assisted reporters » de Newsquest ?","o":["Ils écrivent des éditoriaux avec ChatGPT","Ils transforment communiqués et avis publics en articles avec un outil d'IA, puis vérifient faits et citations","Ils traduisent le site en anglais","Ils animent un chatbot pour les lecteurs"],"ok":1,"why":"36 journalistes au Royaume-Uni, selon Press Gazette. La direction dit libérer les autres reporters pour le terrain (p. 57)."},{"id":"1","q":"Comment le New York Times a-t-il traité 400 heures d'enregistrements fuités ?","o":["Il a publié les résumés produits par l'IA","Transcription et repérage avec l'IA, chaque passage revérifié sur l'enregistrement","Il a confié le travail à une agence","Il a renoncé : trop de matériel"],"ok":1,"why":"Près de 5 millions de mots. L'IA trouve ce qu'une recherche par mot-clé rate ; le journaliste contrôle (p. 56)."},{"id":"2","q":"Les « tip sheets » de CalMatters sont…","o":["des articles publiés automatiquement","des pistes signalées par l'IA, à vérifier par les reporters","des fiches de style","des sondages de lecteurs"],"ok":1,"why":"Selon la direction, elles ne sont pas publiables en l'état : la machine suggère, le reporter établit (p. 58)."},{"id":"3","q":"Le Recopilleur de Jean Abbiateci…","o":["prouve le plagiat","désigne des passages suspects, que le journaliste compare à la main","réécrit les textes plagiés","détecte les images générées"],"ok":1,"why":"Le script ne prouve rien : il trie. La Revue des médias note que l'IA générative, qui reformule à volonté, rend déjà ce type de détection obsolète (p. 60)."}]}$qb$::jsonb),
  ($qb$notebook$qb$, $qb$quiz$qb$, $qb$Gemini Notebook$qb$, $qb${"questions":[{"id":"0","q":"D'où Gemini Notebook tire-t-il ses réponses ?","o":["De tout le web","Des documents chargés dans le carnet, avec un renvoi vers chaque passage","De Wikipédia uniquement","De vos conversations passées"],"ok":1,"why":"Chaque réponse porte des numéros cliquables qui ouvrent le passage cité (p. 69)."},{"id":"1","q":"Une réponse sourcée est…","o":["une réponse vérifiée","un gain de temps pour vérifier, pas une réponse vérifiée","une réponse publiable telle quelle","une réponse sans erreur possible"],"ok":1,"why":"Le modèle peut mal lire, mal résumer, sortir de ses sources. Le lien fait gagner du temps, pas le droit de ne pas lire (p. 71)."},{"id":"2","q":"Que ne faut-il pas faire depuis un compte personnel ?","o":["Charger un rapport public","Verser des documents confidentiels ou des sources protégées","Comparer deux versions d'un texte","Générer une carte mentale"],"ok":1,"why":"Avec un compte Workspace, les données relèvent du contrat de l'entreprise. Depuis un compte personnel, rien de confidentiel (p. 70)."},{"id":"3","q":"Un résumé audio produit par le Studio…","o":["peut être diffusé directement","s'écoute en entier avant toute diffusion","est toujours fidèle","ne peut pas contenir d'erreur"],"ok":1,"why":"C'est l'une des trois choses à ne pas faire : diffuser un résumé audio non écouté (p. 70)."}]}$qb$::jsonb),
  ($qb$jargon$qb$, $qb$quiz$qb$, $qb$Le jargon des assistants$qb$, $qb${"questions":[{"id":"0","q":"Un connecteur, c'est…","o":["un câble USB","un accès autorisé à un service tiers, avec vos droits","un modèle d'IA spécialisé","une extension de navigateur"],"ok":1,"why":"L'assistant lit, et parfois écrit, avec vos droits : l'équivalent d'une délégation de mot de passe (p. 82)."},{"id":"1","q":"MCP désigne…","o":["un modèle de Mistral","un standard ouvert pour brancher des outils sur plusieurs assistants","une loi européenne","un format d'image"],"ok":1,"why":"La « prise USB-C » des IA, publiée par Anthropic en novembre 2024 et adoptée depuis par OpenAI, Google et Microsoft (p. 82, 84)."},{"id":"2","q":"Une compétence (skill), c'est…","o":["une note de satisfaction","un fichier SKILL.md que l'assistant ne charge que si la tâche s'y prête","un abonnement payant","un tutoriel vidéo"],"ok":1,"why":"Une méthode maison écrite une fois : brève maison, vérification de chiffres… (p. 85)."},{"id":"3","q":"Un plugin réunit…","o":["plusieurs modèles","compétences, connecteurs et commandes pour un métier","toutes vos conversations","vos réglages de confidentialité"],"ok":1,"why":"Les clés, la fiche de procédure et la mallette : connecteur, compétence, plugin (p. 85)."},{"id":"4","q":"L'injection de prompt, c'est…","o":["un prompt très long","des instructions cachées dans un mail ou une page, que l'assistant exécute comme si elles venaient de vous","une mise à jour du modèle","un bug d'affichage"],"ok":1,"why":"Un risque propre aux assistants branchés sur vos outils (p. 83)."},{"id":"5","q":"Que mettre dans les instructions personnalisées ?","o":["Vos sources et vos dossiers en cours","Qui vous êtes, le ton, vos exigences de rigueur","Vos identifiants","Le nom de vos interlocuteurs"],"ok":1,"why":"Elles accompagnent toutes les conversations, y compris celles que vous partagez (p. 86)."}]}$qb$::jsonb),
  ($qb$rmctf$qb$, $qb$quiz$qb$, $qb$R·M·C·T·F$qb$, $qb${"questions":[{"id":"0","q":"Que veut dire le M de R·M·C·T·F ?","o":["Modèle","Mission","Méthode","Mémoire"],"ok":1,"why":"La mission dit pour quoi faire, à quelle fin (p. 101)."},{"id":"1","q":"« Public non spécialiste, rapport publié aujourd'hui, appuie-toi uniquement sur ce texte » relève…","o":["du rôle","de la tâche","du contexte","du format"],"ok":2,"why":"Le contexte, c'est ce que l'IA ne peut pas deviner (p. 101)."},{"id":"2","q":"« 5 puces de 25 mots maximum, puis un tableau » relève…","o":["du format","de la mission","du rôle","du contexte"],"ok":0,"why":"Longueur, structure, tableau, ton, langue, ce qu'il ne faut pas faire (p. 101)."},{"id":"3","q":"Le prompt inversé consiste à…","o":["écrire le prompt à l'envers","demander à l'IA de poser d'abord les questions dont elle a besoin","traduire le prompt en anglais","effacer l'historique"],"ok":1,"why":"Un des six réflexes en plus (p. 103)."},{"id":"4","q":"Pourquoi soumettre le même prompt à deux assistants ?","o":["Pour aller plus vite","Leurs écarts révèlent les zones fragiles","Pour économiser des crédits","Ce n'est pas recommandé"],"ok":1,"why":"Ce qui diffère entre deux réponses est ce qu'il faut vérifier en priorité (p. 103)."}]}$qb$::jsonb),
  ($qb$sve$qb$, $qb$quiz$qb$, $qb$S·V·E$qb$, $qb${"questions":[{"id":"0","q":"Dans S·V·E, que recouvre la vérification ?","o":["Relire l'orthographe","Définir avant d'exécuter ce qu'est un bon résultat, puis le contrôler","Faire confiance au modèle le plus récent","Demander à l'IA si elle est sûre"],"ok":1,"why":"Critères écrits, second regard, sources extérieures (p. 105, 107)."},{"id":"1","q":"« Faire le rapport mensuel » est…","o":["un but","une tâche ; le but serait par exemple « décider si l'on garde la rubrique »","une spec complète","un critère de vérification"],"ok":1,"why":"L'IA ne peut pas deviner le but : c'est à vous de le transmettre (p. 106)."},{"id":"2","q":"Faire relire Claude par ChatGPT…","o":["garantit l'absence d'erreur","fait ressortir des erreurs, mais deux modèles peuvent se tromper ensemble","est interdit par les éditeurs","ne sert à rien"],"ok":1,"why":"D'où le retour au document original, que seul l'humain fait (p. 107, 113)."},{"id":"3","q":"Les garde-fous gradués classent les actions en…","o":["facile, moyen, difficile","toujours, demander d'abord, jamais","gratuit, payant","public, privé"],"ok":1,"why":"Une consigne peut être ignorée, un verrou technique non (p. 108)."},{"id":"4","q":"« Conformité n'est pas vérité » signifie…","o":["la méthode est inutile","la boucle contrôle des critères, pas l'exactitude d'un fait","il faut toujours deux modèles","les critères sont facultatifs"],"ok":1,"why":"La vérification journalistique reste humaine et sourcée (p. 109)."}]}$qb$::jsonb),
  ($qb$donnees$qb$, $qb$quiz$qb$, $qb$Vos données$qb$, $qb${"questions":[{"id":"0","q":"Une retranscription d'interview non publiée, avec le nom de la source :","o":["Sans risque","Avec précaution","Jamais"],"ok":2,"why":"Identité d'une source et enregistrements non publiés : jamais (p. 97)."},{"id":"1","q":"Un rapport public de la Cour des comptes :","o":["Jamais","Avec précaution","Sans risque"],"ok":2,"why":"Communiqués, rapports et décisions publics : sans risque (p. 97)."},{"id":"2","q":"Un brouillon qui cite des noms de lieux et de personnes :","o":["Sans risque","Avec précaution, en anonymisant","Jamais"],"ok":1,"why":"« X », « la commune », « le témoin » plutôt que les vrais noms (p. 97, 98)."},{"id":"3","q":"Le premier réglage à faire en créant un compte :","o":["Activer la mémoire","Désactiver l'entraînement","Partager ses conversations","Brancher sa messagerie"],"ok":1,"why":"Entraînement désactivé dès la création du compte (p. 98)."}]}$qb$::jsonb),
  ($qb$niveau$qb$, $qb$poll$qb$, $qb$Sondage d'entrée$qb$, $qb${"q":"Votre niveau avec l'IA générative ?","o":["Jamais utilisée","Quelques essais","Usage régulier","Usage quotidien au travail"]}$qb$::jsonb),
  ($qb$attente$qb$, $qb$cloud$qb$, $qb$Vos attentes$qb$, $qb${"q":"Un mot pour ce que vous attendez de cette formation"}$qb$::jsonb),
  ($qb$carnet$qb$, $qb$poll$qb$, $qb$Point d'étape Notebook$qb$, $qb${"q":"Votre premier carnet : où en êtes-vous ?","o":["Sources chargées","Questions posées","Citations vérifiées","Terminé"]}$qb$::jsonb),
  ($qb$invente$qb$, $qb$poll$qb$, $qb$Notebook a-t-il inventé ?$qb$, $qb${"q":"Gemini Notebook a-t-il inventé quelque chose dans vos réponses ?","o":["Oui","Non","Je ne sais pas"]}$qb$::jsonb),
  ($qb$lettre$qb$, $qb$poll$qb$, $qb$La lettre oubliée$qb$, $qb${"q":"Quelle lettre de R·M·C·T·F oubliez-vous le plus souvent ?","o":["R · Rôle","M · Mission","C · Contexte","T · Tâche","F · Format"]}$qb$::jsonb),
  ($qb$fini$qb$, $qb$poll$qb$, $qb$Où en est l'exercice ?$qb$, $qb${"q":"Où en êtes-vous de l'exercice ?","o":["J'ai terminé","Presque","J'ai besoin d'aide"]}$qb$::jsonb),
  ($qb$ia$qb$, $qb$cloud$qb$, $qb$L'IA en un mot$qb$, $qb${"q":"Un mot pour décrire l'IA aujourd'hui"}$qb$::jsonb),
  ($qb$lundi$qb$, $qb$cloud$qb$, $qb$Lundi matin$qb$, $qb${"q":"Qu'allez-vous tester lundi matin ?"}$qb$::jsonb),
  ($qb$penible$qb$, $qb$cloud$qb$, $qb$La tâche pénible$qb$, $qb${"q":"En quelques mots : la tâche la plus pénible de votre semaine"}$qb$::jsonb)
on conflict (id) do nothing;
-- <<< contenu repris de data.js

-- 3. Copie des quiz dans chaque session
alter table public.sessions add column if not exists quizzes jsonb not null default '{}';
alter table public.sessions drop constraint if exists sessions_quizzes_check;
alter table public.sessions add constraint sessions_quizzes_check
  check (jsonb_typeof(quizzes) = 'object' and pg_column_size(quizzes) < 300000);

-- 4. La duplication reprend les quiz de la session (reprise de 20261124040000_durcissement.sql)
create or replace function public.duplicate_session(
  p_session uuid, p_title text default null, p_date date default null, p_date2 date default null,
  p_invites boolean default false, p_secret_values boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  if not exists (select 1 from sessions where id = p_session) then raise exception 'session introuvable'; end if;
  insert into sessions (title, formation, client, date, date2, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
                        slides_url, emargement_url, emargement_qr, support_unlocked, emargement_label, emargement2_enabled, emargement2_text, decks,
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online, skip_pages, access_mode, quizzes)
    select coalesce(nullif(btrim(p_title), ''), title || ' (copie)'), formation, client, p_date, case when format = '2' then p_date2 end,
           format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, false, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online, skip_pages, access_mode, quizzes
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value)
    select nid, label, case when p_secret_values then value else '' end from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  if p_invites then
    insert into session_invites (session_id, email)
      select nid, email from session_invites where session_id = p_session
      union
      select nid, lower(u.email) from session_members m join auth.users u on u.id = m.user_id
        where m.session_id = p_session and u.email is not null
      on conflict do nothing;
  end if;
  return nid;
end $$;
revoke all on function public.duplicate_session(uuid, text, date, date, boolean, boolean) from public;
grant execute on function public.duplicate_session(uuid, text, date, date, boolean, boolean) to authenticated;
