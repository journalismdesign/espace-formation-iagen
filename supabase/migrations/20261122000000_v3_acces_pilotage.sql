-- =====================================================================
-- v3 : accès stagiaire par code personnel, dates sur deux jours, logos,
-- émargement, support débloqué en fin de formation, slides Drive.
-- À exécuter après 20261121000000_init.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sessions : dates, horaires, identité visuelle, liens
-- ---------------------------------------------------------------------
alter table public.sessions
  add column if not exists date2            date,
  add column if not exists start_time       time not null default '09:30',
  add column if not exists end_time         time not null default '17:30',
  add column if not exists brand_id         uuid,
  add column if not exists client_logo      text,          -- logo propre à la session (data URL), prioritaire
  add column if not exists slides_url       text,          -- support Google Slides projeté
  add column if not exists emargement_url   text,          -- lien de l'outil d'émargement (QR généré)
  add column if not exists emargement_qr    text,          -- ou image du QR fournie par l'organisme (data URL)
  add column if not exists support_unlocked boolean not null default false; -- déblocage manuel anticipé

-- Logos des entreprises clientes (trois préenregistrés, d'autres possibles)
create table if not exists public.brands (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  logo  text,                      -- data URL (PNG, SVG, JPEG), ≤ 300 Ko
  sort  int not null default 100,
  check (logo is null or length(logo) < 400000)
);
alter table public.brands enable row level security;
insert into public.brands (name, sort) values ('Radio France', 1), ('France Télévisions', 2), ('Libération', 3)
  on conflict (name) do nothing;
alter table public.sessions drop constraint if exists sessions_brand_fk;
alter table public.sessions add constraint sessions_brand_fk foreign key (brand_id) references public.brands(id) on delete set null;

-- Réglages généraux (organisme de formation)
create table if not exists public.app_settings (
  key    text primary key,
  value  text,
  check (length(coalesce(value,'')) < 400000)
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('org_name', 'Samsa'), ('org_logo', null)
  on conflict (key) do nothing;

-- Lien du support : lisible par les stagiaires seulement une fois débloqué
create table if not exists public.session_support (
  session_id  uuid primary key references public.sessions(id) on delete cascade,
  url         text not null check (url ~* '^https?://')
);
alter table public.session_support enable row level security;

-- Codes d'accès personnels : jamais lisibles par un client
create table if not exists public.access_codes (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  email       text not null check (email = lower(email)),
  first_name  text not null default '',
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  sent_at     timestamptz not null default now(),
  primary key (session_id, email)
);
alter table public.access_codes enable row level security;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke all on public.access_codes from anon, authenticated;
revoke insert, update, delete on public.brands, public.app_settings, public.session_support from anon, authenticated;
grant insert, update, delete on public.brands, public.app_settings, public.session_support to authenticated;
grant select on public.brands, public.app_settings to authenticated;
grant select on public.session_support to authenticated;

drop policy if exists "logo : lire" on public.brands;
create policy "logo : lire" on public.brands for select using (auth.uid() is not null);
drop policy if exists "logo : formateur" on public.brands;
create policy "logo : formateur" on public.brands for all using (public.is_trainer()) with check (public.is_trainer());
drop policy if exists "réglage : lire" on public.app_settings;
create policy "réglage : lire" on public.app_settings for select using (auth.uid() is not null);
drop policy if exists "réglage : formateur" on public.app_settings;
create policy "réglage : formateur" on public.app_settings for all using (public.is_trainer()) with check (public.is_trainer());
drop policy if exists "support : formateur" on public.session_support;
create policy "support : formateur" on public.session_support for all using (public.is_trainer()) with check (public.is_trainer());

-- ---------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------
-- Dernier jour de formation
create or replace function public.session_last_day(s public.sessions) returns date
language sql immutable as $$ select coalesce(case when s.format = '2' then s.date2 end, s.date) $$;

-- Fin de validité des codes : fin du dernier jour, heure de Paris
create or replace function public.access_expiry(p_session uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(((public.session_last_day(s) + time '23:59') at time zone 'Europe/Paris'), now() + interval '1 day')
  from sessions s where s.id = p_session;
$$;

-- Déblocage du support : une heure avant la fin du dernier jour (ou manuel)
create or replace function public.support_unlock_at(p_session uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((public.session_last_day(s) + s.end_time) at time zone 'Europe/Paris') - interval '1 hour'
  from sessions s where s.id = p_session;
$$;

create or replace function public.support_status(p_session uuid)
returns table (unlocked boolean, unlock_at timestamptz, url text, configured boolean)
language plpgsql stable security definer set search_path = public as $$
declare u boolean; at timestamptz; lnk text;
begin
  if not public.can_see(p_session) then raise exception 'accès refusé'; end if;
  select public.support_unlock_at(p_session) into at;
  select s.support_unlocked or (at is not null and now() >= at) into u from sessions s where s.id = p_session;
  select ss.url into lnk from session_support ss where ss.session_id = p_session;
  return query select u, at, case when u or public.is_trainer() then lnk end, lnk is not null;
end $$;

-- Informations publiques d'une session (slide d'ouverture, avant connexion)
drop function if exists public.session_public(text);
create function public.session_public(p_code text)
returns table (id uuid, title text, formation text, client text, date date, date2 date, start_time time, end_time time,
               format text, status text, client_logo text, org_name text, org_logo text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.formation, coalesce(nullif(s.client,''), b.name, ''), s.date,
         case when s.format = '2' then s.date2 end, s.start_time, s.end_time, s.format, s.status,
         coalesce(s.client_logo, b.logo),
         (select value from app_settings where key = 'org_name'),
         (select value from app_settings where key = 'org_logo')
  from sessions s left join brands b on b.id = s.brand_id
  where s.code = upper(trim(p_code)) and s.status <> 'closed';
$$;

-- Purge des codes expirés, et de tous les codes d'une session close
create or replace function public.purge_access_codes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from access_codes a using sessions s
   where a.session_id = s.id and (a.expires_at < now() or s.status = 'closed');
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.on_session_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' then delete from access_codes where session_id = new.id; end if;
  return new;
end $$;
drop trigger if exists session_closed_purge on public.sessions;
create trigger session_closed_purge after update of status on public.sessions
  for each row execute function public.on_session_closed();

grant execute on function public.session_public(text) to anon, authenticated;
grant execute on function public.support_status(uuid), public.support_unlock_at(uuid), public.access_expiry(uuid) to authenticated;
revoke execute on function public.purge_access_codes() from anon, authenticated;

-- Purge horaire si pg_cron est disponible (Database → Extensions → pg_cron)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-access-codes', '7 * * * *', 'select public.purge_access_codes()');
exception when others then
  raise notice 'pg_cron indisponible : les codes expirés sont refusés à la vérification et purgés à chaque demande.';
end $$;

-- Duplication : reprend aussi identité visuelle, horaires, liens et support
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  insert into sessions (title, formation, client, date, format, activities, start_time, end_time, brand_id, client_logo, slides_url, emargement_url, emargement_qr)
    select title || ' (copie)', formation, client, null, format, activities, start_time, end_time, brand_id, client_logo, slides_url, emargement_url, emargement_qr
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  return nid;
end $$;
