-- Profils des intervenant·es (fiche présentée sur la slide « L'intervenant »)
-- roles   : [{ "label": "Fondateur de", "value": "Synth", "url": "https://synthmedia.fr" }, …]
-- socials : [{ "label": "@gholubowicz", "url": "https://…" }, …]
-- tagline : accroche, les **passages entre doubles astérisques** s'affichent en bleu
create table if not exists public.trainers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 1 and 100),
  photo        text check (photo is null or length(photo) < 600000),
  roles        jsonb not null default '[]' check (jsonb_typeof(roles) = 'array'),
  tagline      text check (tagline is null or length(tagline) <= 300),
  tagline_sub  text check (tagline_sub is null or length(tagline_sub) <= 200),
  email        text,
  website      text,
  socials      jsonb not null default '[]' check (jsonb_typeof(socials) = 'array'),
  created_at   timestamptz not null default now()
);
alter table public.trainers enable row level security;
revoke insert, update, delete on public.trainers from anon, authenticated;
grant insert, update, delete on public.trainers to authenticated;
drop policy if exists "intervenant : lire" on public.trainers;
create policy "intervenant : lire" on public.trainers for select using (auth.uid() is not null);
drop policy if exists "intervenant : formateur" on public.trainers;
create policy "intervenant : formateur" on public.trainers for all using (public.is_trainer()) with check (public.is_trainer());

alter table public.sessions add column if not exists trainer_id uuid references public.trainers(id) on delete set null;

-- La duplication reprend tous les réglages d'affichage
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  insert into sessions (title, formation, client, date, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
                        slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id)
    select title || ' (copie)', formation, client, null, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  return nid;
end $$;
