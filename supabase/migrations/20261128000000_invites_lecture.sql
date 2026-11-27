-- =====================================================================
-- Mode invitation : un·e invité·e (rôle « guest ») parcourt le back-office
-- et toutes les sessions en LECTURE SEULE, jusqu'à sa date de fin.
--  * Déclaré·e par l'admin dans « Équipe et accès » (trainer_emails.guest,
--    guest_until). Passé la date de fin, la base ne lui montre plus rien.
--  * Lecture : sessions, ressources, participant·es (identités masquées :
--    « Stagiaire 1, 2… », sans e-mail), progression, cadrages, résultats
--    agrégés, bibliothèque de quiz, discussion (auteurs masqués, par
--    guest_discussion). Jamais : invitations (adresses), codes d'exercice,
--    réponses nominatives, liste de l'équipe.
--  * Écriture : aucune. manages, is_trainer et is_admin excluent déjà le
--    rôle ; is_member, join_session, claim_invites et les mises à jour de
--    sa propre progression ou de son cadrage l'excluent désormais aussi.
-- Rejouable. Compatible avec le site d'avant : save_staff(text, boolean)
-- et list_staff restent disponibles ; list_team donne aussi rôle et date de fin.
-- À exécuter après 20261126000000_quiz_sondages.sql
-- =====================================================================

-- 1. Le rôle
alter table public.trainer_emails add column if not exists guest boolean not null default false;
alter table public.trainer_emails add column if not exists guest_until date;
do $$ begin
  alter table public.trainer_emails add constraint trainer_emails_guest_not_admin check (not (guest and is_admin));
exception when duplicate_object then null; end $$;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('trainee', 'trainer', 'admin', 'guest'));

create or replace function public.staff_role(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select case when t.guest then 'guest' when t.is_admin then 'admin' else 'trainer' end
  from trainer_emails t where t.email = lower(p_email);
$$;

create or replace function public.promote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = case when new.guest then 'guest' when new.is_admin then 'admin' else 'trainer' end
  where lower(email) = lower(new.email);
  return new;
end $$;

create or replace function public.demote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = 'trainee' where lower(email) = lower(old.email) and role in ('trainer', 'admin', 'guest');
  return old;
end $$;

-- Rôle invité·e (sert à fermer les écritures, même après la date de fin)
create or replace function public.is_guest() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'guest');
$$;
-- Invité·e dont l'accès court encore (sert à ouvrir les lectures)
create or replace function public.guest_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join trainer_emails t on t.email = lower(p.email)
    where p.id = auth.uid() and p.role = 'guest' and t.guest
      and (t.guest_until is null or t.guest_until >= (now() at time zone 'Europe/Paris')::date));
$$;
-- Pour le bandeau de l'invité·e : accès en cours, date de fin
create or replace function public.guest_status() returns table (active boolean, until date)
language sql stable security definer set search_path = public as $$
  select public.guest_active(), t.guest_until
  from profiles p join trainer_emails t on t.email = lower(p.email)
  where p.id = auth.uid() and t.guest;
$$;

-- 2. Lectures ouvertes à l'invité·e
create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_members where session_id = sid and user_id = auth.uid())
     and not public.is_guest();
$$;
create or replace function public.can_see(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages(sid) or public.is_member(sid) or public.guest_active();
$$;

drop policy if exists "membre : invité·e lit" on public.session_members;
create policy "membre : invité·e lit" on public.session_members for select using (public.guest_active());
drop policy if exists "cadrage : invité·e lit" on public.projects;
create policy "cadrage : invité·e lit" on public.projects for select using (public.guest_active());
drop policy if exists "bibliothèque : lecture invité·e" on public.quiz_bank;
create policy "bibliothèque : lecture invité·e" on public.quiz_bank for select to authenticated using (public.guest_active());

-- Codes d'exercice : participant·es (session ouverte) et équipe de la session, jamais l'invité·e
drop policy if exists "accès : lire" on public.session_secrets;
create policy "accès : lire" on public.session_secrets for select using (
  public.manages(session_id)
  or (public.is_member(session_id) and exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'closed'))
);

-- Participant·es : identités masquées pour l'invité·e (numérotées dans l'ordre d'arrivée)
create or replace function public.session_roster(p_session uuid)
returns table (user_id uuid, email text, full_name text, metier text, niveau text,
               attended boolean, joined_at timestamptz, progress jsonb,
               project_id uuid, project_status text, project_title text, project_steps int)
language plpgsql stable security definer set search_path = public as $$
declare g boolean := not public.manages(p_session) and public.guest_active();
begin
  if not (public.manages(p_session) or g) then raise exception 'réservé au formateur de la session'; end if;
  return query
    select m.user_id,
           case when g then null else p.email end,
           case when g then 'Stagiaire ' || row_number() over (order by m.joined_at, m.user_id) else p.full_name end,
           p.metier, p.niveau, m.attended, m.joined_at, m.progress,
           pr.id, pr.status, pr.data->'retenu'->>'titre',
           coalesce(jsonb_array_length(pr.data->'steps'), 0)
    from session_members m
    join profiles p on p.id = m.user_id
    left join projects pr on pr.session_id = m.session_id and pr.user_id = m.user_id
    where m.session_id = p_session
    order by case when g then null else p.full_name end, case when g then null else p.email end, m.joined_at, m.user_id;
end $$;

-- Discussion lue par l'invité·e : auteurs remplacés par « Stagiaire N » ou « Équipe »
create or replace function public.guest_discussion(p_session uuid)
returns table (kind text, id uuid, thread_id uuid, title text, body text, created_at timestamptz,
               staff boolean, author text, author_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.manages(p_session) or public.guest_active()) then raise exception 'lecture réservée à l''équipe'; end if;
  return query
    with nums as (
      select m.user_id, row_number() over (order by m.joined_at, m.user_id) as n
      from session_members m where m.session_id = p_session
    )
    select 'thread'::text, t.id, t.id, t.title, t.body, t.created_at, t.staff,
           case when t.staff then 'equipe' when nm.n is not null then 's' || nm.n else 'autre' end,
           case when t.staff then 'Équipe' when nm.n is not null then 'Stagiaire ' || nm.n else 'Participant·e' end
    from threads t left join nums nm on nm.user_id = t.author
    where t.session_id = p_session
    union all
    select 'post'::text, p.id, p.thread_id, null::text, p.body, p.created_at, p.staff,
           case when p.staff then 'equipe' when nm.n is not null then 's' || nm.n else 'autre' end,
           case when p.staff then 'Équipe' when nm.n is not null then 'Stagiaire ' || nm.n else 'Participant·e' end
    from posts p left join nums nm on nm.user_id = p.author
    where p.session_id = p_session;
end $$;

-- 3. Écritures fermées à l'invité·e
create or replace function public.join_session(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; mode text; em text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if public.is_guest() then return null; end if; -- lecture seule : ne rejoint aucune session
  if not public.throttle_hit('join:' || auth.uid()::text, 30, 3600) then return null; end if;
  select id, access_mode into sid, mode from sessions where code = upper(trim(p_code)) and status <> 'closed';
  if sid is null then return null; end if;
  if mode = 'invites' and not public.manages(sid)
     and not exists (select 1 from session_members where session_id = sid and user_id = auth.uid()) then
    select lower(email) into em from auth.users where id = auth.uid();
    if not exists (select 1 from session_invites where session_id = sid and email = em) then return null; end if;
  end if;
  insert into session_members (session_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create or replace function public.claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.is_guest() then return 0; end if;
  insert into session_members (session_id, user_id)
  select i.session_id, auth.uid() from session_invites i
  where i.email = lower(auth.jwt()->>'email')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Un·e ancien·ne stagiaire devenu·e invité·e ne modifie plus sa progression ni son cadrage
drop policy if exists "membre : sa progression" on public.session_members;
create policy "membre : sa progression" on public.session_members for update
  using (user_id = auth.uid() and not public.is_guest()) with check (user_id = auth.uid() and not public.is_guest());
drop policy if exists "cadrage : modifier le sien" on public.projects;
create policy "cadrage : modifier le sien" on public.projects for update
  using (user_id = auth.uid() and not public.is_guest()) with check (user_id = auth.uid() and not public.is_guest());

-- 4. Gestion de l'équipe : trois rôles (formateur·ice, admin, invité·e avec date de fin)
-- (list_staff garde ses colonnes : le site d'avant s'en sert, et les migrations doivent pouvoir être rejouées)
create or replace function public.list_team()
returns table (email text, is_admin boolean, created_at timestamptz, has_account boolean, trainer_name text,
               role text, guest_until date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  return query select t.email, t.is_admin, t.created_at,
    exists (select 1 from profiles p where lower(p.email) = t.email),
    (select tr.name from trainers tr where tr.login_email = t.email limit 1),
    case when t.guest then 'guest' when t.is_admin then 'admin' else 'trainer' end,
    t.guest_until
  from trainer_emails t order by t.is_admin desc, t.guest, t.email;
end $$;

create or replace function public.save_staff(p_email text, p_role text, p_until date default null) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); g boolean := p_role = 'guest';
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  if p_role is null or p_role not in ('trainer', 'admin', 'guest') then raise exception 'rôle inconnu'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'adresse e-mail invalide'; end if;
  if p_role <> 'admin' and e = (select lower(email) from profiles where id = auth.uid()) then
    raise exception 'vous ne pouvez pas retirer vos propres droits d''administration';
  end if;
  insert into trainer_emails (email, is_admin, guest, guest_until)
    values (e, p_role = 'admin', g, case when g then p_until end)
    on conflict (email) do update set is_admin = excluded.is_admin, guest = excluded.guest, guest_until = excluded.guest_until;
end $$;

-- Ancienne signature (site d'avant cette migration) : formateur·ice ou admin, jamais invité·e
create or replace function public.save_staff(p_email text, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.save_staff(p_email, case when p_admin then 'admin' else 'trainer' end, null);
end $$;

-- 5. Droits d'exécution : comptes connectés seulement (jamais sans connexion)
revoke execute on function public.is_guest(), public.guest_active(), public.guest_status(), public.guest_discussion(uuid),
  public.list_team(), public.save_staff(text, text, date), public.save_staff(text, boolean) from public, anon;
grant execute on function public.is_guest(), public.guest_active(), public.guest_status(), public.guest_discussion(uuid),
  public.list_team(), public.save_staff(text, text, date), public.save_staff(text, boolean) to authenticated;
