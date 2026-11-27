-- =====================================================================
-- Formations de 1 à 5 journées, une date par journée
--  * sessions.dates : la date de chaque journée, dans l'ordre (jour 1 à 5).
--    date et date2 restent tenues à jour par le site (jour 1 et jour 2),
--    pour tout ce qui les lit encore.
--  * sessions.format : le nombre de journées, de '1' à '5'.
--  * Dernier jour (validité des codes, déblocage du support, archivage) :
--    la plus tardive des dates.
--  * La duplication décale toutes les dates du même écart que le jour 1.
-- Rejouable. À exécuter après 20261128010000_archives.sql
-- =====================================================================

alter table public.sessions add column if not exists dates date[];
do $$ begin
  alter table public.sessions add constraint sessions_dates_check check (dates is null or cardinality(dates) between 1 and 5);
exception when duplicate_object then null; end $$;
alter table public.sessions drop constraint if exists sessions_format_check;
alter table public.sessions add constraint sessions_format_check check (format in ('1', '2', '3', '4', '5'));

create or replace function public.session_last_day(s public.sessions) returns date
language sql immutable as $$
  select coalesce((select max(d) from unnest(s.dates) d), case when s.format = '2' then s.date2 end, s.date)
$$;

-- Entrée stagiaire : date2 porte le dernier jour (slide de titre « 1 – 4 décembre 2026 »)
create or replace function public.session_public(p_code text)
returns table (id uuid, title text, formation text, client text, date date, date2 date, start_time time, end_time time,
               format text, status text, client_logo text, client_logo_light text, org_name text, org_logo text, org_logo_light text,
               skin_id uuid, skin_name text, skin_accent text, skin_dark text, skin_logo text, skin_logo_light text, skin_footer text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.formation, coalesce(nullif(s.client,''), b.name, ''), s.date,
         case when s.format <> '1' then coalesce((select max(d) from unnest(s.dates) d), s.date2) end,
         s.start_time, s.end_time, s.format, s.status,
         coalesce(s.client_logo, b.logo), coalesce(s.client_logo_light, b.logo_light),
         (select value from app_settings where key = 'org_name'),
         (select value from app_settings where key = 'org_logo'),
         (select value from app_settings where key = 'org_logo_light'),
         k.id, k.name, k.accent, k.dark, k.logo, k.logo_light, k.footer
  from sessions s
  left join brands b on b.id = s.brand_id
  left join skins k on k.id = coalesce(s.skin_id, (select (value)::uuid from app_settings where key = 'default_skin' and value ~ '^[0-9a-f-]{36}$'))
  where s.code = upper(trim(p_code)) and s.status <> 'closed';
$$;
grant execute on function public.session_public(text) to anon, authenticated;

-- Duplication : toutes les dates décalées du même écart que le jour 1 (reprise de 20261126000000_quiz_sondages.sql)
create or replace function public.duplicate_session(
  p_session uuid, p_title text default null, p_date date default null, p_date2 date default null,
  p_invites boolean default false, p_secret_values boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; src sessions%rowtype; v_dates date[];
begin
  if not public.is_admin() then raise exception 'réservé à l''administration'; end if;
  select * into src from sessions where id = p_session;
  if not found then raise exception 'session introuvable'; end if;
  v_dates := case
    when p_date is null then null
    when src.format = '2' and p_date2 is not null then array[p_date, p_date2]
    when src.dates is not null and src.date is not null then
      (select array_agg(case when d is null then null else d + (p_date - src.date) end order by o) from unnest(src.dates) with ordinality u(d, o))
    when src.format = '1' then array[p_date]
    else null end;
  insert into sessions (title, formation, client, date, date2, dates, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
                        slides_url, emargement_url, emargement_qr, support_unlocked, emargement_label, emargement2_enabled, emargement2_text, decks,
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online, skip_pages, access_mode, quizzes)
    values (coalesce(nullif(btrim(p_title), ''), src.title || ' (copie)'), src.formation, src.client, p_date,
           case when src.format <> '1' then coalesce(p_date2, v_dates[2]) end, v_dates,
           src.format, src.activities, src.start_time, src.end_time, src.brand_id, src.client_logo, src.client_logo_light,
           src.slides_url, src.emargement_url, src.emargement_qr, false, src.emargement_label, src.emargement2_enabled, src.emargement2_text, src.decks,
           src.evaluation_url, src.evaluation_qr, src.evaluation_title, src.evaluation_text, src.trainer_id, src.skin_id, src.programme, src.online,
           src.skip_pages, src.access_mode, src.quizzes)
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
