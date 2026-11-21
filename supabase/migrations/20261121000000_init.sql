-- =====================================================================
-- Espace formation IA générative : schéma, droits (RLS) et fonctions
-- À exécuter une fois dans le SQL Editor de Supabase (ou `supabase db push`).
-- Principe : un·e stagiaire ne voit que ses sessions, son cadrage, ses
-- réponses ; les résultats collectifs passent par des fonctions qui ne
-- renvoient que des agrégats. Les formateur·ices voient tout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Formateur·ices : la liste des e-mails autorisés est tenue à la main
-- (SQL Editor), jamais depuis l'application.
-- ---------------------------------------------------------------------
create table if not exists public.trainer_emails (
  email text primary key check (email = lower(email))
);
alter table public.trainer_emails enable row level security;
-- aucune politique : invisible pour les clients

-- ---------------------------------------------------------------------
-- Profils (un par compte)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'trainee' check (role in ('trainee','trainer')),
  metier      text,
  niveau      text,
  outils      text[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'trainer');
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name,''), split_part(email,'@',1)) from profiles where id = auth.uid();
$$;

-- Création automatique du profil à la première connexion
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    case when exists (select 1 from trainer_emails t where t.email = lower(new.email)) then 'trainer' else 'trainee' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Sessions de formation
-- activities : liste ordonnée des activités du jour J
-- live       : état diffusé en direct { act, started_at, reveal, options }
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  formation   text not null default 'Prendre en main les IA génératives',
  client      text not null default '',
  date        date,
  format      text not null default '1' check (format in ('1','2')),
  code        text not null unique default upper(substr(md5(gen_random_uuid()::text),1,6)),
  status      text not null default 'draft' check (status in ('draft','live','closed')),
  activities  jsonb not null default '[]',
  live        jsonb not null default '{}',
  owner       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.sessions enable row level security;

create table if not exists public.session_members (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  attended    boolean not null default false,
  progress    jsonb not null default '{}',
  primary key (session_id, user_id)
);
alter table public.session_members enable row level security;

create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_members where session_id = sid and user_id = auth.uid());
$$;

create or replace function public.can_see(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_trainer() or public.is_member(sid);
$$;

create table if not exists public.session_invites (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  email       text not null check (email = lower(email)),
  created_at  timestamptz not null default now(),
  primary key (session_id, email)
);
alter table public.session_invites enable row level security;

create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  title       text not null,
  url         text not null check (url ~* '^https?://'),
  created_at  timestamptz not null default now()
);
alter table public.resources enable row level security;

-- Codes et accès des exercices (comptes de test, clés d'API de démo…)
create table if not exists public.session_secrets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  label       text not null,
  value       text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.session_secrets enable row level security;

-- ---------------------------------------------------------------------
-- Cadrage : le cas d'usage préparé par chaque stagiaire
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data             jsonb not null default '{}',
  status           text not null default 'draft' check (status in ('draft','validated')),
  validated_at     timestamptz,
  question         text not null default '',
  trainer_comment  text not null default '',
  ai_generations   int not null default 0,
  updated_at       timestamptz not null default now(),
  unique (session_id, user_id)
);
alter table public.projects enable row level security;

-- ---------------------------------------------------------------------
-- Réponses aux activités en direct (une par personne et par activité)
-- ---------------------------------------------------------------------
create table if not exists public.responses (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  activity_id  text not null,
  value        jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (session_id, user_id, activity_id)
);
alter table public.responses enable row level security;

-- ---------------------------------------------------------------------
-- Discussion
-- ---------------------------------------------------------------------
create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  author       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  author_name  text not null default public.my_name(),
  title        text not null check (length(title) between 1 and 160),
  body         text not null default '' check (length(body) <= 4000),
  created_at   timestamptz not null default now()
);
alter table public.threads enable row level security;

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.threads(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  author       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  author_name  text not null default public.my_name(),
  body         text not null check (length(body) between 1 and 4000),
  created_at   timestamptz not null default now()
);
alter table public.posts enable row level security;

-- Quota d'appels à l'IA (écrit uniquement par la fonction Edge)
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null default current_date,
  n        int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- =====================================================================
-- Droits par colonne : ce que chaque client peut écrire
-- =====================================================================
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke select on public.trainer_emails, public.ai_usage from anon, authenticated;

grant update (full_name, metier, niveau, outils) on public.profiles to authenticated;
grant insert, update, delete on public.sessions, public.session_invites, public.resources, public.session_secrets to authenticated;
grant update (progress) on public.session_members to authenticated;
grant delete on public.session_members to authenticated;
grant insert (session_id, data, status, validated_at, question) on public.projects to authenticated;
grant update (data, status, validated_at, question, updated_at) on public.projects to authenticated;
grant insert (session_id, activity_id, value), update (value, created_at) on public.responses to authenticated;
grant insert (session_id, title, body), delete on public.threads to authenticated;
grant insert (thread_id, session_id, body), delete on public.posts to authenticated;

-- =====================================================================
-- Politiques RLS
-- =====================================================================
-- profils
create policy "profil : soi ou formateur" on public.profiles for select
  using (id = auth.uid() or public.is_trainer());
create policy "profil : modifier le sien" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- sessions
create policy "session : lire si membre ou formateur" on public.sessions for select
  using (public.can_see(id));
create policy "session : formateur écrit" on public.sessions for insert with check (public.is_trainer());
create policy "session : formateur modifie" on public.sessions for update using (public.is_trainer()) with check (public.is_trainer());
create policy "session : formateur supprime" on public.sessions for delete using (public.is_trainer());

-- membres
create policy "membre : soi ou formateur" on public.session_members for select
  using (user_id = auth.uid() or public.is_trainer());
create policy "membre : sa progression" on public.session_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "membre : formateur retire" on public.session_members for delete using (public.is_trainer());

-- invitations, ressources, accès
create policy "invitation : formateur" on public.session_invites for all using (public.is_trainer()) with check (public.is_trainer());
create policy "ressource : lire" on public.resources for select using (public.can_see(session_id));
create policy "ressource : formateur" on public.resources for all using (public.is_trainer()) with check (public.is_trainer());
create policy "accès : lire" on public.session_secrets for select using (public.can_see(session_id));
create policy "accès : formateur" on public.session_secrets for all using (public.is_trainer()) with check (public.is_trainer());

-- cadrages
create policy "cadrage : soi ou formateur" on public.projects for select
  using (user_id = auth.uid() or public.is_trainer());
create policy "cadrage : créer le sien" on public.projects for insert
  with check (user_id = auth.uid() and public.is_member(session_id));
create policy "cadrage : modifier le sien" on public.projects for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- réponses
create policy "réponse : soi ou formateur" on public.responses for select
  using (user_id = auth.uid() or public.is_trainer());
create policy "réponse : répondre" on public.responses for insert
  with check (user_id = auth.uid() and public.is_member(session_id));
create policy "réponse : changer d'avis" on public.responses for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- discussion
create policy "fil : lire" on public.threads for select using (public.can_see(session_id));
create policy "fil : écrire" on public.threads for insert with check (author = auth.uid() and public.can_see(session_id));
create policy "fil : supprimer" on public.threads for delete using (author = auth.uid() or public.is_trainer());
create policy "message : lire" on public.posts for select using (public.can_see(session_id));
create policy "message : écrire" on public.posts for insert with check (author = auth.uid() and public.can_see(session_id));
create policy "message : supprimer" on public.posts for delete using (author = auth.uid() or public.is_trainer());

-- =====================================================================
-- Fonctions appelées par l'application
-- =====================================================================

-- Rejoindre une session avec son code (QR code ou saisie)
create or replace function public.join_session(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select id into sid from sessions where code = upper(trim(p_code)) and status <> 'closed';
  if sid is null then raise exception 'code inconnu ou session close'; end if;
  insert into session_members (session_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

-- Rattacher le compte aux sessions où son e-mail a été invité
create or replace function public.claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into session_members (session_id, user_id)
  select i.session_id, auth.uid() from session_invites i
  where i.email = lower(auth.jwt()->>'email')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Résultats agrégés d'une activité : jamais de nom, seulement des comptes
create or replace function public.live_results(p_session uuid, p_activity text)
returns table (value jsonb, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_see(p_session) then raise exception 'accès refusé'; end if;
  return query
    select r.value, count(*) from responses r
    where r.session_id = p_session and r.activity_id = p_activity
    group by r.value;
end $$;

-- Émargement (formateur)
create or replace function public.set_attended(p_session uuid, p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  update session_members set attended = p_value where session_id = p_session and user_id = p_user;
end $$;

-- Retour du formateur sur un cadrage
create or replace function public.comment_project(p_project uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  update projects set trainer_comment = left(p_comment, 4000) where id = p_project;
end $$;

-- Tableau des participant·es d'une session (formateur)
create or replace function public.session_roster(p_session uuid)
returns table (user_id uuid, email text, full_name text, metier text, niveau text,
               attended boolean, joined_at timestamptz, progress jsonb,
               project_id uuid, project_status text, project_title text, project_steps int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  return query
    select m.user_id, p.email, p.full_name, p.metier, p.niveau, m.attended, m.joined_at, m.progress,
           pr.id, pr.status, pr.data->'retenu'->>'titre',
           coalesce(jsonb_array_length(pr.data->'steps'), 0)
    from session_members m
    join profiles p on p.id = m.user_id
    left join projects pr on pr.session_id = m.session_id and pr.user_id = m.user_id
    where m.session_id = p_session
    order by p.full_name, p.email;
end $$;

-- Dupliquer une session (sans participant·es ni réponses)
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  insert into sessions (title, formation, client, date, format, activities)
    select title || ' (copie)', formation, client, null, format, activities from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  return nid;
end $$;

grant execute on function public.join_session(text), public.claim_invites(), public.live_results(uuid,text),
  public.set_attended(uuid,uuid,boolean), public.comment_project(uuid,text), public.session_roster(uuid),
  public.duplicate_session(uuid), public.is_trainer(), public.my_name() to authenticated;

-- =====================================================================
-- Temps réel
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions, public.responses, public.threads,
      public.posts, public.projects, public.session_members;
  end if;
end $$;
