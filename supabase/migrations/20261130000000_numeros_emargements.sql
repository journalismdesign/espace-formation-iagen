-- =====================================================================
-- Numéro de session, émargement par demi-journée, liste des stagiaires
--  * Chaque session reçoit un numéro : année de création + rang dans
--    l'année (affiché 2026-012). Il est attribué par la base à la
--    création (duplication comprise), ne change jamais, et distingue deux
--    sessions qui portent le même titre. Les sessions de démo des
--    invité·es n'en ont pas.
--  * Émargement par demi-journée (session_members.presence) :
--    { "j1-matin": { "self": horodatage, "staff": true|false, "by", "at" } }
--    « self » : le ou la stagiaire a touché « J'ai émargé » (sign_presence) ;
--    « staff » : correction de l'équipe de la session (set_presence),
--    qui l'emporte. Lecture par l'équipe : session_presence().
--  * list_trainees() : les adresses de tous les stagiaires (inscrit·es et
--    invité·es), pour l'administration seule.
-- Rejouable. À exécuter après 20261129010000_trames.sql
-- =====================================================================

-- ---------- Numéro de session ----------
alter table public.sessions add column if not exists num_year int;
alter table public.sessions add column if not exists num_seq int;
create unique index if not exists sessions_num_idx on public.sessions (num_year, num_seq) where num_seq is not null;

-- Sessions existantes (hors démos), dans l'ordre de création, à la suite des numéros déjà attribués
with ranked as (
  select id, extract(year from (created_at at time zone 'Europe/Paris'))::int as y,
         row_number() over (partition by extract(year from (created_at at time zone 'Europe/Paris')) order by created_at, id) as n
  from public.sessions where num_seq is null and demo_owner is null
)
update public.sessions s
   set num_year = r.y, num_seq = r.n + coalesce((select max(x.num_seq) from public.sessions x where x.num_year = r.y), 0)
  from ranked r where s.id = r.id;

create or replace function public.session_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y int;
begin
  if tg_op = 'UPDATE' then -- le numéro ne change jamais
    new.num_year := old.num_year; new.num_seq := old.num_seq;
    return new;
  end if;
  if new.demo_owner is not null then new.num_year := null; new.num_seq := null; return new; end if;
  y := extract(year from (coalesce(new.created_at, now()) at time zone 'Europe/Paris'))::int;
  perform pg_advisory_xact_lock(7300000 + y); -- deux créations simultanées n'obtiennent pas le même rang
  new.num_year := y;
  new.num_seq := coalesce((select max(num_seq) from sessions where num_year = y), 0) + 1;
  return new;
end $$;
revoke execute on function public.session_number() from public, anon, authenticated;
drop trigger if exists session_number on public.sessions;
create trigger session_number before insert or update of num_year, num_seq on public.sessions
  for each row execute function public.session_number();

-- ---------- Émargement par demi-journée ----------
alter table public.session_members add column if not exists presence jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.session_members add constraint session_members_presence_ok
    check (jsonb_typeof(presence) = 'object' and octet_length(presence::text) <= 8000);
exception when duplicate_object then null; end $$;

-- Le ou la stagiaire déclare avoir émargé (créneau ouvert côté site ; l'équipe peut corriger)
create or replace function public.sign_presence(p_session uuid, p_slot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_slot is null or p_slot !~ '^j[1-5]-(matin|aprem)$' then raise exception 'créneau inconnu'; end if;
  if not public.is_member(p_session) then raise exception 'réservé aux participant·es de la session'; end if;
  if exists (select 1 from sessions where id = p_session and status = 'closed') or public.session_archived(p_session) then
    raise exception 'la session est terminée';
  end if;
  update session_members
     set presence = presence || jsonb_build_object(p_slot,
         coalesce(presence->p_slot, '{}'::jsonb) || jsonb_build_object('self', coalesce(presence->p_slot->'self', to_jsonb(now()))))
   where session_id = p_session and user_id = auth.uid()
  returning presence into r;
  return r;
end $$;

-- L'équipe de la session corrige : présent·e (true), absent·e (false), retour à la déclaration (null)
create or replace function public.set_presence(p_session uuid, p_user uuid, p_slot text, p_value boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_slot is null or p_slot !~ '^j[1-5]-(matin|aprem)$' then raise exception 'créneau inconnu'; end if;
  if not public.manages(p_session) then raise exception 'réservé à l''équipe de la session'; end if;
  update session_members
     set presence = presence || jsonb_build_object(p_slot,
         case when p_value is null then coalesce(presence->p_slot, '{}'::jsonb) - 'staff' - 'by' - 'at'
              else coalesce(presence->p_slot, '{}'::jsonb) || jsonb_build_object('staff', p_value, 'by', auth.uid(), 'at', now()) end)
   where session_id = p_session and user_id = p_user
  returning presence into r;
  if r is null then raise exception 'participant·e introuvable'; end if;
  return r;
end $$;

-- Feuille de la session : une ligne par participant·e
create or replace function public.session_presence(p_session uuid)
returns table (user_id uuid, presence jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages(p_session) then raise exception 'réservé à l''équipe de la session'; end if;
  return query select m.user_id, m.presence from session_members m where m.session_id = p_session;
end $$;

-- ---------- Adresses des stagiaires (administration) ----------
-- Une ligne par personne et par session : inscrit·es (joined) et invité·es qui ne sont pas encore entré·es
create or replace function public.list_trainees()
returns table (email text, full_name text, metier text, niveau text, session_id uuid, joined boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  return query
    select lower(p.email), p.full_name, p.metier, p.niveau, m.session_id, true, m.joined_at
      from session_members m
      join profiles p on p.id = m.user_id
      join sessions s on s.id = m.session_id
     where s.demo_owner is null and p.role = 'trainee'
    union all
    select i.email, null::text, null::text, null::text, i.session_id, false, null::timestamptz
      from session_invites i
      join sessions s on s.id = i.session_id
     where s.demo_owner is null
       and not exists (select 1 from session_members m join profiles p on p.id = m.user_id
                        where m.session_id = i.session_id and lower(p.email) = i.email);
end $$;

revoke execute on function public.sign_presence(uuid, text), public.set_presence(uuid, uuid, text, boolean),
  public.session_presence(uuid), public.list_trainees() from public, anon;
grant execute on function public.sign_presence(uuid, text), public.set_presence(uuid, uuid, text, boolean),
  public.session_presence(uuid), public.list_trainees() to authenticated;
