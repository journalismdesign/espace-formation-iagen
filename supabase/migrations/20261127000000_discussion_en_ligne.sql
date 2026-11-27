-- =====================================================================
-- Discussion des stagiaires réservée à la formation en ligne
--  * chat_open(sid) : l'équipe garde la main ; les stagiaires lisent et
--    écrivent seulement quand la session est en ligne (sessions.online)
--    et pas close. En salle, la discussion leur est fermée.
--  * Les messages déjà écrits ne bougent pas : ils redeviennent lisibles
--    si l'équipe active la formation en ligne.
-- Rejouable. À exécuter après 20261126000000_quiz_sondages.sql
-- =====================================================================

create or replace function public.chat_open(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages(sid)
      or (public.is_member(sid) and exists (
            select 1 from sessions s where s.id = sid and s.online and s.status <> 'closed'));
$$;
revoke execute on function public.chat_open(uuid) from public, anon;
grant execute on function public.chat_open(uuid) to authenticated;
