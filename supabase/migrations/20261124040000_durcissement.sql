-- =====================================================================
-- Durcissement (phase 0) : limites anti-abus, mode d'accès des sessions,
-- essais de code atomiques, fermeture après clôture, énumération de l'équipe,
-- discussion, contraintes sur les URLs et les tailles, droits d'exécution.
-- Rejouable sans erreur. À exécuter après 20261124030000_pages_masquees.sql,
-- puis redéployer la fonction access (elle utilise throttle_hit et try_access_code).
-- =====================================================================

-- 1. Limites anti-abus : un compteur par « seau » (adresse IP, session, utilisateur·ice…) et par fenêtre
create table if not exists public.access_throttle (
  bucket     text primary key,
  win_start  timestamptz not null default now(),
  n          int not null default 0
);
alter table public.access_throttle enable row level security;
revoke all on public.access_throttle from anon, authenticated;
grant all on public.access_throttle to service_role;

-- Vrai tant que le seau n'a pas dépassé p_max appels sur p_secs secondes (l'appel est compté)
create or replace function public.throttle_hit(p_bucket text, p_max int, p_secs int) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare cnt int;
begin
  insert into access_throttle as t (bucket, win_start, n) values (left(p_bucket, 200), now(), 1)
  on conflict (bucket) do update
    set n = case when t.win_start < now() - make_interval(secs => p_secs) then 1 else t.n + 1 end,
        win_start = case when t.win_start < now() - make_interval(secs => p_secs) then now() else t.win_start end
  returning n into cnt;
  return cnt <= p_max;
end $$;

-- La purge horaire efface aussi les vieux compteurs
create or replace function public.purge_access_codes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from access_codes a using sessions s
   where a.session_id = s.id and (a.expires_at < now() or s.status = 'closed');
  get diagnostics n = row_count;
  delete from access_throttle where win_start < now() - interval '2 days';
  return n;
end $$;

-- 2. Code personnel : essai compté de façon atomique (le verrou de ligne sérialise les essais simultanés)
--    'ok' | 'bad:<essais restants>' | 'locked' | 'none'
create or replace function public.try_access_code(p_session uuid, p_email text, p_hash text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare h text; a int;
begin
  update access_codes set attempts = attempts + 1
   where session_id = p_session and email = lower(p_email) and expires_at > now() and attempts < 8
   returning code_hash, attempts into h, a;
  if not found then
    if exists (select 1 from access_codes where session_id = p_session and email = lower(p_email) and expires_at > now())
      then return 'locked'; end if;
    return 'none';
  end if;
  if h = p_hash then
    update access_codes set attempts = 0 where session_id = p_session and email = lower(p_email);
    return 'ok';
  end if;
  return 'bad:' || (8 - a);
end $$;

-- 3. Sessions : mode d'accès et codes plus longs
alter table public.sessions add column if not exists access_mode text not null default 'ouvert';
do $$ begin
  alter table public.sessions add constraint sessions_access_mode_check check (access_mode in ('ouvert', 'invites'));
exception when duplicate_object then null; end $$;

-- Nouveaux codes de session : 8 caractères sans ambiguïté (sans 0/O, 1/I/L). Les codes existants restent valables.
create or replace function public.gen_session_code() returns text
language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; c text; i int;
begin
  loop
    b := uuid_send(gen_random_uuid()); c := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop  -- octets 6 et 8 en partie fixes dans un UUID v4
      c := c || substr(a, 1 + (get_byte(b, i) % 31), 1);
    end loop;
    exit when not exists (select 1 from sessions where code = c);
  end loop;
  return c;
end $$;
alter table public.sessions alter column code set default public.gen_session_code();

-- Rejoindre par le code : limité par utilisateur·ice ; en mode « invites », réservé aux personnes invitées.
-- Échec : renvoie null (pas d'exception, pour que le compteur anti-abus soit bien enregistré).
create or replace function public.join_session(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; mode text; em text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
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

-- La duplication reprend le mode d'accès
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
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online, skip_pages, access_mode)
    select coalesce(nullif(btrim(p_title), ''), title || ' (copie)'), formation, client, p_date, case when format = '2' then p_date2 end,
           format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, false, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online, skip_pages, access_mode
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

-- 4. Code d'accès formateur : plafond global d'essais (20 par quart d'heure), en plus du ralentissement
create or replace function public.check_trainer_code(p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare ok boolean := false;
begin
  if public.throttle_hit('trainer_code', 20, 900) then
    select exists (select 1 from private_settings where key = 'trainer_code_hash'
                   and value = encode(sha256(convert_to(trim(coalesce(p_code, '')), 'UTF8')), 'hex')) into ok;
  end if;
  if not ok then perform pg_sleep(0.6); end if;
  return ok;
end $$;

-- 5. Après la clôture : codes d'exercice masqués aux stagiaires, plus de réponses
drop policy if exists "accès : lire" on public.session_secrets;
create policy "accès : lire" on public.session_secrets for select using (
  public.manages(session_id)
  or (public.can_see(session_id) and exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'closed'))
);

create or replace function public.submit_response(p_session uuid, p_activity text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'connectez-vous d''abord'; end if;
  if not public.is_member(p_session) then raise exception 'vous ne participez pas à cette session'; end if;
  if not exists (select 1 from sessions where id = p_session and status = 'live') then raise exception 'la salle est fermée'; end if;
  if length(coalesce(p_activity, '')) not between 1 and 200 then raise exception 'activité inconnue'; end if;
  if pg_column_size(p_value) > 20000 then raise exception 'réponse trop longue'; end if;
  insert into responses (session_id, user_id, activity_id, value, created_at)
  values (p_session, auth.uid(), p_activity, p_value, now())
  on conflict (session_id, user_id, activity_id) do update set value = excluded.value, created_at = excluded.created_at;
end $$;
-- Les réponses ne s'écrivent plus que par submit_response (le chemin direct contournait les contrôles)
revoke insert, update on public.responses from authenticated;

-- 6. Équipe : adresses non énumérables
revoke execute on function public.staff_role(text) from public, anon, authenticated;
revoke select on public.trainers from authenticated;
grant select (id, name, photo, roles, tagline, tagline_sub, email, website, socials, created_at) on public.trainers to authenticated;
create or replace function public.trainer_logins() returns table (id uuid, login_email text)
language sql stable security definer set search_path = public as $$
  select t.id, t.login_email from trainers t where public.is_trainer();
$$;

-- 7. Discussion : seule l'équipe supprime une conversation (sinon tous ses messages partiraient) ;
--    un message ne peut viser qu'une conversation de la même session
drop policy if exists "fil : supprimer" on public.threads;
create policy "fil : supprimer" on public.threads for delete using (public.manages(session_id));
create or replace function public.post_same_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from threads where id = new.thread_id and session_id = new.session_id) then
    raise exception 'conversation d''une autre session';
  end if;
  return new;
end $$;
drop trigger if exists post_same_session on public.posts;
create trigger post_same_session before insert or update on public.posts
  for each row execute function public.post_same_session();

-- 8. Contraintes (not valid : les données existantes ne sont pas revérifiées, les nouvelles le sont)
do $$ begin
  alter table public.sessions add constraint sessions_emargement_url_https check (emargement_url is null or emargement_url ~* '^https://') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sessions add constraint sessions_evaluation_url_http check (evaluation_url is null or evaluation_url ~* '^https?://') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sessions add constraint sessions_emargement_qr_image check (emargement_qr is null or emargement_qr ~* '^(https://|data:image/(png|jpeg|gif|webp|svg\+xml);base64,)') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sessions add constraint sessions_evaluation_qr_image check (evaluation_qr is null or evaluation_qr ~* '^(https://|data:image/(png|jpeg|gif|webp|svg\+xml);base64,)') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  -- 200 et non 80 : le déclencheur de création de compte reprend le nom fourni par Google, il ne doit jamais échouer
  alter table public.profiles add constraint profiles_full_name_len check (full_name is null or length(full_name) <= 200) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.session_members add constraint session_members_progress_size check (octet_length(progress::text) <= 20000) not valid;
exception when duplicate_object then null; end $$;

-- 9. Droits d'exécution : « grant execute on all functions » (20261122090000) les avait tous ouverts.
--    Sans connexion (anon), seules trois fonctions restent appelables ; les fonctions internes ne le sont
--    plus pour personne d'autre que service_role (fonction Edge) et leur propriétaire.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.session_public(text), public.trainer_code_configured(), public.check_trainer_code(text) to anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.staff_role(text), public.purge_access_codes(), public.throttle_hit(text, int, int),
  public.try_access_code(uuid, text, text) from authenticated;
grant execute on all functions in schema public to service_role;
