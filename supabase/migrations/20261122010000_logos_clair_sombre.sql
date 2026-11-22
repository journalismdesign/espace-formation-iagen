-- Deux versions de chaque logo :
--   logo        → version sombre, pour les fonds clairs (barre latérale, bandeau de l'écran)
--   logo_light  → version claire, pour les fonds marine (slides de titre, entrée stagiaire)
alter table public.brands add column if not exists logo_light text check (logo_light is null or length(logo_light) < 400000);
alter table public.sessions add column if not exists client_logo_light text;
insert into public.app_settings (key, value) values ('org_logo_light', null) on conflict (key) do nothing;

drop function if exists public.session_public(text);
create function public.session_public(p_code text)
returns table (id uuid, title text, formation text, client text, date date, date2 date, start_time time, end_time time,
               format text, status text, client_logo text, client_logo_light text, org_name text, org_logo text, org_logo_light text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.formation, coalesce(nullif(s.client,''), b.name, ''), s.date,
         case when s.format = '2' then s.date2 end, s.start_time, s.end_time, s.format, s.status,
         coalesce(s.client_logo, b.logo), coalesce(s.client_logo_light, b.logo_light),
         (select value from app_settings where key = 'org_name'),
         (select value from app_settings where key = 'org_logo'),
         (select value from app_settings where key = 'org_logo_light')
  from sessions s left join brands b on b.id = s.brand_id
  where s.code = upper(trim(p_code)) and s.status <> 'closed';
$$;
grant execute on function public.session_public(text) to anon, authenticated;

-- La duplication reprend aussi la version claire du logo propre à la session
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  insert into sessions (title, formation, client, date, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light, slides_url, emargement_url, emargement_qr)
    select title || ' (copie)', formation, client, null, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light, slides_url, emargement_url, emargement_qr
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  return nid;
end $$;
