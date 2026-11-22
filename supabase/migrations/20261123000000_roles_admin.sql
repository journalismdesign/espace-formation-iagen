-- Rôles : administrateur·ice et formateur·ices.
-- L'admin gère tout (réglages, habillages, logos, fiches intervenant·es, comptes, attribution des sessions).
-- Un·e formateur·ice ne voit et ne pilote que les sessions qui lui sont attribuées : celles dont la fiche
-- intervenant·e (sessions.trainer_id) porte son adresse de connexion (trainers.login_email).

-- 1. Rôle « admin » et comptes de l'équipe
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('trainee', 'trainer', 'admin'));
alter table public.trainer_emails add column if not exists is_admin boolean not null default false;
alter table public.trainer_emails add column if not exists created_at timestamptz not null default now();
alter table public.trainers add column if not exists login_email text check (login_email is null or login_email = lower(login_email));

-- Les comptes déjà déclarés avant cette migration deviennent admins (c'est l'équipe d'origine)
do $$ begin
  if not exists (select 1 from public.trainer_emails where is_admin) then
    update public.trainer_emails set is_admin = true;
  end if;
end $$;

-- Rôle d'une adresse d'après la liste de l'équipe
create or replace function public.staff_role(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select case when t.is_admin then 'admin' else 'trainer' end from trainer_emails t where t.email = lower(p_email);
$$;

update public.profiles p set role = coalesce(public.staff_role(p.email), case when p.role = 'admin' then 'trainee' else p.role end)
where public.staff_role(p.email) is not null or p.role = 'admin';

-- 2. Fonctions d'accès
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
-- « Équipe » : admin ou formateur·ice (accès au back-office)
create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('trainer', 'admin'));
$$;
-- Pilote cette session : admin, ou formateur·ice dont la fiche est attribuée à la session
create or replace function public.manages(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from sessions s join trainers t on t.id = s.trainer_id
    join profiles p on p.id = auth.uid() and p.role in ('trainer', 'admin')
    where s.id = sid and t.login_email is not null and t.login_email = lower(p.email));
$$;
create or replace function public.can_see(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages(sid) or public.is_member(sid);
$$;
-- Profils visibles : le sien, tous pour l'admin, ceux des participant·es de ses sessions pour un·e formateur·ice
create or replace function public.sees_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid() or public.is_admin()
    or exists (select 1 from session_members m where m.user_id = pid and public.manages(m.session_id));
$$;
grant execute on function public.is_admin(), public.is_trainer(), public.manages(uuid), public.can_see(uuid), public.sees_profile(uuid) to authenticated;

-- 3. Rôle attribué à la création du compte, à l'ajout dans l'équipe et à la connexion
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, lower(new.email),
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          coalesce(public.staff_role(new.email), 'trainee'))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.promote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = case when new.is_admin then 'admin' else 'trainer' end where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists on_trainer_email_added on public.trainer_emails;
create trigger on_trainer_email_added after insert or update on public.trainer_emails
  for each row execute function public.promote_trainer_email();

create or replace function public.demote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = 'trainee' where lower(email) = lower(old.email) and role in ('trainer', 'admin');
  return old;
end $$;
drop trigger if exists on_trainer_email_removed on public.trainer_emails;
create trigger on_trainer_email_removed after delete on public.trainer_emails
  for each row execute function public.demote_trainer_email();

create or replace function public.claim_trainer() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_email text; v_role text;
begin
  select lower(email) into v_email from profiles where id = auth.uid();
  if v_email is null then return false; end if;
  v_role := public.staff_role(v_email);
  if v_role is not null then
    update profiles set role = v_role where id = auth.uid() and role <> v_role;
    return true;
  end if;
  return public.is_trainer();
end $$;

-- 4. Gestion de l'équipe (admin seulement ; la table reste illisible depuis le navigateur)
create or replace function public.list_staff()
returns table (email text, is_admin boolean, created_at timestamptz, has_account boolean, trainer_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  return query select t.email, t.is_admin, t.created_at,
    exists (select 1 from profiles p where lower(p.email) = t.email),
    (select tr.name from trainers tr where tr.login_email = t.email limit 1)
  from trainer_emails t order by t.is_admin desc, t.email;
end $$;

create or replace function public.save_staff(p_email text, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'adresse e-mail invalide'; end if;
  if not p_admin and e = (select lower(email) from profiles where id = auth.uid()) then
    raise exception 'vous ne pouvez pas retirer vos propres droits d''administration';
  end if;
  insert into trainer_emails (email, is_admin) values (e, p_admin)
    on conflict (email) do update set is_admin = excluded.is_admin;
end $$;

create or replace function public.remove_staff(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  if e = (select lower(email) from profiles where id = auth.uid()) then raise exception 'vous ne pouvez pas retirer votre propre accès'; end if;
  delete from trainer_emails where email = e;
end $$;
revoke execute on function public.list_staff(), public.save_staff(text, boolean), public.remove_staff(text) from public, anon;
grant execute on function public.list_staff(), public.save_staff(text, boolean), public.remove_staff(text) to authenticated;

-- 5. Règles d'accès : chaque session ne s'ouvre qu'à qui la pilote
drop policy if exists "profil : soi ou formateur" on public.profiles;
create policy "profil : soi ou formateur" on public.profiles for select using (public.sees_profile(id));

drop policy if exists "session : formateur écrit" on public.sessions;
create policy "session : formateur écrit" on public.sessions for insert with check (public.is_admin());
drop policy if exists "session : formateur modifie" on public.sessions;
create policy "session : formateur modifie" on public.sessions for update using (public.manages(id)) with check (public.manages(id));
drop policy if exists "session : formateur supprime" on public.sessions;
create policy "session : formateur supprime" on public.sessions for delete using (public.is_admin());

-- Seul l'admin attribue une session (sa fiche intervenant·e) et choisit son habillage (environnement du centre de formation)
create or replace function public.guard_session_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' and not public.is_admin() then
    if new.trainer_id is distinct from old.trainer_id then raise exception 'seule l''administration attribue une session'; end if;
    if new.skin_id is distinct from old.skin_id then raise exception 'seule l''administration choisit l''habillage d''une session'; end if;
  end if;
  return new;
end $$;
drop trigger if exists session_trainer_guard on public.sessions;
create trigger session_trainer_guard before update on public.sessions for each row execute function public.guard_session_trainer();

drop policy if exists "membre : soi ou formateur" on public.session_members;
create policy "membre : soi ou formateur" on public.session_members for select using (user_id = auth.uid() or public.manages(session_id));
drop policy if exists "membre : formateur retire" on public.session_members;
create policy "membre : formateur retire" on public.session_members for delete using (public.manages(session_id));

drop policy if exists "invitation : formateur" on public.session_invites;
create policy "invitation : formateur" on public.session_invites for all using (public.manages(session_id)) with check (public.manages(session_id));
drop policy if exists "ressource : formateur" on public.resources;
create policy "ressource : formateur" on public.resources for all using (public.manages(session_id)) with check (public.manages(session_id));
drop policy if exists "accès : formateur" on public.session_secrets;
create policy "accès : formateur" on public.session_secrets for all using (public.manages(session_id)) with check (public.manages(session_id));
drop policy if exists "support : formateur" on public.session_support;
create policy "support : formateur" on public.session_support for all using (public.manages(session_id)) with check (public.manages(session_id));

drop policy if exists "cadrage : soi ou formateur" on public.projects;
create policy "cadrage : soi ou formateur" on public.projects for select using (user_id = auth.uid() or public.manages(session_id));
drop policy if exists "réponse : soi ou formateur" on public.responses;
create policy "réponse : soi ou formateur" on public.responses for select using (user_id = auth.uid() or public.manages(session_id));
drop policy if exists "fil : supprimer" on public.threads;
create policy "fil : supprimer" on public.threads for delete using (author = auth.uid() or public.manages(session_id));
drop policy if exists "message : supprimer" on public.posts;
create policy "message : supprimer" on public.posts for delete using (author = auth.uid() or public.manages(session_id));

-- Réglages communs : lecture pour l'équipe, écriture pour l'admin
drop policy if exists "logo : formateur" on public.brands;
create policy "logo : formateur" on public.brands for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "réglage : formateur" on public.app_settings;
create policy "réglage : formateur" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "intervenant : formateur" on public.trainers;
create policy "intervenant : formateur" on public.trainers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "habillage : formateur" on public.skins;
create policy "habillage : formateur" on public.skins for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 6. Fonctions de session : vérifient désormais la session concernée
create or replace function public.set_attended(p_session uuid, p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.manages(p_session) then raise exception 'réservé au formateur de la session'; end if;
  update session_members set attended = p_value where session_id = p_session and user_id = p_user;
end $$;

create or replace function public.comment_project(p_project uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.manages((select session_id from projects where id = p_project)) then raise exception 'réservé au formateur de la session'; end if;
  update projects set trainer_comment = left(p_comment, 4000) where id = p_project;
end $$;

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

create or replace function public.support_status(p_session uuid)
returns table (unlocked boolean, unlock_at timestamptz, url text, configured boolean)
language plpgsql stable security definer set search_path = public as $$
declare u boolean; at timestamptz; lnk text;
begin
  if not public.can_see(p_session) then raise exception 'accès refusé'; end if;
  select public.support_unlock_at(p_session) into at;
  select s.support_unlocked or (at is not null and now() >= at) into u from sessions s where s.id = p_session;
  select ss.url into lnk from session_support ss where ss.session_id = p_session;
  return query select u, at, case when u or public.manages(p_session) then lnk end, lnk is not null;
end $$;

-- La duplication crée une session : admin seulement
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  insert into sessions (title, formation, client, date, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
                        slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme)
    select title || ' (copie)', formation, client, null, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  return nid;
end $$;
