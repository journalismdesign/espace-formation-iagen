-- =====================================================================
-- Duplication complète d'une session, pour bâtir une formation à partir
-- d'une existante : réglages, déroulé et activités, conducteur importé,
-- habillage, intervenant·e, présentations, émargement, évaluation,
-- support, mode en ligne, ressources et intitulés des codes d'accès.
-- En option : les invitations (mêmes stagiaires) et les valeurs des codes.
-- Jamais copiés : participant·es, réponses, cadrages, discussion, état
-- du direct, codes de connexion. La copie part en brouillon, avec un
-- nouveau code de session.
-- À exécuter après 20261124010000_en_ligne.sql
-- =====================================================================
drop function if exists public.duplicate_session(uuid);

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
                        evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online)
    select coalesce(nullif(btrim(p_title), ''), title || ' (copie)'), formation, client, p_date, case when format = '2' then p_date2 end,
           format, activities, start_time, end_time, brand_id, client_logo, client_logo_light,
           slides_url, emargement_url, emargement_qr, false, emargement_label, emargement2_enabled, emargement2_text, decks,
           evaluation_url, evaluation_qr, evaluation_title, evaluation_text, trainer_id, skin_id, programme, online
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
revoke all on function public.duplicate_session(uuid, text, date, date, boolean, boolean) from public;
grant execute on function public.duplicate_session(uuid, text, date, date, boolean, boolean) to authenticated;
