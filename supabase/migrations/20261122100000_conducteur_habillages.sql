-- Conducteur importé (Markdown) et habillages par centre de formation.

-- 1. Habillages : une couleur d'accent et un logo par centre de formation (INA, Journalism.design, ESJ, CFJ…)
create table if not exists public.skins (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  accent     text not null default '#124F90' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  dark       text check (dark is null or dark ~ '^#[0-9A-Fa-f]{6}$'),
  logo       text check (logo is null or length(logo) < 400000),
  logo_light text check (logo_light is null or length(logo_light) < 400000),
  footer     text check (footer is null or length(footer) <= 40),
  created_at timestamptz not null default now()
);
alter table public.skins enable row level security;
drop policy if exists "habillage : lecture" on public.skins;
create policy "habillage : lecture" on public.skins for select to authenticated using (true);
drop policy if exists "habillage : formateur" on public.skins;
create policy "habillage : formateur" on public.skins for all to authenticated using (public.is_trainer()) with check (public.is_trainer());
grant select, insert, update, delete on public.skins to authenticated;
grant all on public.skins to service_role;
insert into public.app_settings (key, value) values ('default_skin', null) on conflict (key) do nothing;

-- 2. Sessions : habillage choisi et conducteur importé ({formation, days, nDays, modules})
alter table public.sessions add column if not exists skin_id uuid references public.skins(id) on delete set null;
alter table public.sessions add column if not exists programme jsonb
  check (programme is null or (jsonb_typeof(programme) = 'object' and pg_column_size(programme) < 500000));

-- 3. Entrée stagiaire (sans connexion) : l'habillage voyage avec les informations publiques de la session
drop function if exists public.session_public(text);
create function public.session_public(p_code text)
returns table (id uuid, title text, formation text, client text, date date, date2 date, start_time time, end_time time,
               format text, status text, client_logo text, client_logo_light text, org_name text, org_logo text, org_logo_light text,
               skin_id uuid, skin_name text, skin_accent text, skin_dark text, skin_logo text, skin_logo_light text, skin_footer text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.formation, coalesce(nullif(s.client,''), b.name, ''), s.date,
         case when s.format = '2' then s.date2 end, s.start_time, s.end_time, s.format, s.status,
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

-- 4. La duplication reprend l'habillage et le conducteur
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
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
grant execute on function public.duplicate_session(uuid) to authenticated;
