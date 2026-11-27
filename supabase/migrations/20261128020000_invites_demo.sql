-- =====================================================================
-- Invité·es : deux sessions de démonstration à manipuler librement
-- (remplace la lecture seule de toutes les sessions de …_invites_lecture.sql)
--  * Chaque invité·e a ses propres sessions de démo (sessions.demo_owner),
--    deux au plus : une d'une journée, une de deux journées, créées par le
--    site à sa première visite. Il ou elle les pilote comme un·e
--    formateur·ice : réglages, activités, écran, côté stagiaire.
--  * Il ou elle ne voit plus aucune autre session, n'en crée pas d'autre,
--    ne touche ni à l'équipe ni aux réglages généraux.
--  * Les sessions de démo n'apparaissent pas dans la liste de l'équipe
--    (filtrées par le site) ; elles partent avec le compte de l'invité·e.
--  * Passé la date de fin de l'invitation, plus rien n'est visible.
-- Rejouable. À exécuter après 20261128010000_archives.sql
-- =====================================================================

alter table public.sessions add column if not exists demo_owner uuid references auth.users(id) on delete cascade;
create index if not exists sessions_demo_owner_idx on public.sessions (demo_owner);

-- Piloter : l'équipe comme avant, et l'invité·e (accès en cours) sur ses sessions de démo
create or replace function public.manages(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from sessions s join trainers t on t.id = s.trainer_id
    join profiles p on p.id = auth.uid() and p.role in ('trainer', 'admin')
    where s.id = sid and t.login_email is not null and t.login_email = lower(p.email))
  or (public.guest_active() and exists (select 1 from sessions s where s.id = sid and s.demo_owner = auth.uid()));
$$;
-- Voir : plus de lecture de toutes les sessions pour l'invité·e
create or replace function public.can_see(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages(sid) or public.is_member(sid);
$$;
drop policy if exists "membre : invité·e lit" on public.session_members;
drop policy if exists "cadrage : invité·e lit" on public.projects;

-- Sessions de démo : lecture de la ligne même (aussi au moment de sa création), création (deux au plus), suppression
create or replace function public.guest_demo_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from sessions where demo_owner = auth.uid();
$$;
drop policy if exists "session : démo de l'invité·e (lecture)" on public.sessions;
create policy "session : démo de l'invité·e (lecture)" on public.sessions for select
  using (demo_owner = auth.uid() and public.guest_active());
drop policy if exists "session : démo de l'invité·e (création)" on public.sessions;
create policy "session : démo de l'invité·e (création)" on public.sessions for insert
  with check (demo_owner = auth.uid() and public.guest_active() and public.guest_demo_count() < 2);
drop policy if exists "session : démo de l'invité·e (suppression)" on public.sessions;
create policy "session : démo de l'invité·e (suppression)" on public.sessions for delete
  using (demo_owner = auth.uid() and public.guest_active());

-- Accès invité·e retiré, ou changé en formateur·ice ou admin : ses sessions de démo partent avec
create or replace function public.promote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = case when new.guest then 'guest' when new.is_admin then 'admin' else 'trainer' end
  where lower(email) = lower(new.email);
  if not new.guest then
    delete from sessions where demo_owner in (select id from profiles where lower(email) = lower(new.email));
  end if;
  return new;
end $$;
create or replace function public.demote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = 'trainee' where lower(email) = lower(old.email) and role in ('trainer', 'admin', 'guest');
  delete from sessions where demo_owner in (select id from profiles where lower(email) = lower(old.email));
  return old;
end $$;

-- Une session ne change pas de propriétaire de démo (sauf par l'administration)
create or replace function public.guard_demo_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' and not public.is_admin()
     and new.demo_owner is distinct from old.demo_owner then
    raise exception 'une session de démonstration ne change pas de propriétaire';
  end if;
  return new;
end $$;
drop trigger if exists session_demo_owner_guard on public.sessions;
create trigger session_demo_owner_guard before update on public.sessions for each row execute function public.guard_demo_owner();

-- Participant·es et discussion : plus de version masquée, l'équipe de la session (dont l'invité·e sur sa démo) voit tout
create or replace function public.session_roster(p_session uuid)
returns table (user_id uuid, email text, full_name text, metier text, niveau text,
               attended boolean, joined_at timestamptz, progress jsonb,
               project_id uuid, project_status text, project_title text, project_steps int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages(p_session) then raise exception 'réservé au formateur de la session'; end if;
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
drop function if exists public.guest_discussion(uuid);

revoke execute on function public.guest_demo_count(), public.guard_demo_owner() from public, anon;
grant execute on function public.guest_demo_count() to authenticated;
