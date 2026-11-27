-- =====================================================================
-- Clôture automatique : une session passe à « Terminée » (status
-- closed) au plus tard 15 minutes après son heure de fin (end_time, dans
-- ses réglages), le dernier jour de la formation, heure de Paris.
--  * close_finished_sessions() ferme d'un coup toutes les sessions
--    finies (sauf les sessions de démonstration des invité·es). La
--    clôture purge codes et accès directs, comme une clôture à la main.
--  * Appelée par le site (liste des sessions, pilotage, espace
--    stagiaire) et, si pg_cron est disponible, toutes les 5 minutes.
--  * Sans effet sur une session sans date. Rouvrir une session finie la
--    referme au passage suivant : prolonger l'heure de fin pour continuer.
-- Rejouable. À exécuter après 20261128020000_invites_demo.sql
-- =====================================================================

create or replace function public.close_finished_sessions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update sessions s set status = 'closed', live = '{}'::jsonb
   where s.status <> 'closed'
     and s.demo_owner is null
     and public.session_last_day(s) is not null
     and ((public.session_last_day(s) + coalesce(s.end_time, time '17:30') + interval '15 minutes') at time zone 'Europe/Paris') <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.close_finished_sessions() from public, anon;
grant execute on function public.close_finished_sessions() to authenticated;

-- Toutes les 5 minutes si pg_cron est disponible (sinon, le site s'en charge à chaque visite)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('close-finished-sessions', '*/5 * * * *', 'select public.close_finished_sessions()');
exception when others then
  raise notice 'pg_cron indisponible : les sessions finies sont closes par le site à chaque visite.';
end $$;
