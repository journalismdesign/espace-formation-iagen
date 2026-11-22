-- Évaluation de fin de stage : lien, QR (image fournie ou généré), titre et texte modifiables
alter table public.sessions
  add column if not exists evaluation_url   text check (evaluation_url is null or evaluation_url ~* '^https?://'),
  add column if not exists evaluation_qr    text,
  add column if not exists evaluation_title text check (evaluation_title is null or length(evaluation_title) <= 160),
  add column if not exists evaluation_text  text check (evaluation_text is null or length(evaluation_text) <= 500);

-- La duplication reprend tous les réglages d'affichage
create or replace function public.duplicate_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not public.is_trainer() then raise exception 'réservé aux formateurs'; end if;
  insert into sessions (title, formation, client, date, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
                        slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text)
    select title || ' (copie)', formation, client, null, format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text
    from sessions where id = p_session
    returning id into nid;
  insert into resources (session_id, title, url) select nid, title, url from resources where session_id = p_session;
  insert into session_secrets (session_id, label, value) select nid, label, '' from session_secrets where session_id = p_session;
  insert into session_support (session_id, url) select nid, url from session_support where session_id = p_session;
  return nid;
end $$;
