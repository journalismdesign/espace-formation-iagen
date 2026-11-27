-- =====================================================================
-- Archivage : 5 jours après le dernier jour de la formation (heure de
-- Paris), une session est archivée. Les stagiaires n'ont plus accès à ses
-- contenus : ressources, codes d'exercice, cadrage, réponses, discussion,
-- lien du support. Ils lisent encore la ligne de la session (titre,
-- dates) pour que l'espace affiche « Session archivée » et l'adresse de
-- contact. L'équipe et les invité·es, qui ne sont pas participant·es,
-- gardent leurs accès (onglet « Sessions archivées » du back-office).
--  * Calculé à la lecture (session_last_day + 5), sans tâche planifiée.
--  * Politiques RESTRICTIVES : elles s'ajoutent en « et » aux politiques
--    existantes, sans les réécrire. Elles ne visent que les participant·es.
-- Rejouable. Indépendante de …_invites_lecture.sql.
-- À exécuter après 20261128000000_invites_lecture.sql
-- =====================================================================

create or replace function public.session_archived(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.session_last_day(s) + 5 <= (now() at time zone 'Europe/Paris')::date
    from sessions s where s.id = sid), false);
$$;
revoke execute on function public.session_archived(uuid) from public, anon;
grant execute on function public.session_archived(uuid) to authenticated;

-- Contenus d'une session archivée : fermés aux participant·es (lecture et écriture)
do $$
declare t text;
begin
  foreach t in array array['resources', 'session_secrets', 'projects', 'responses', 'threads', 'posts'] loop
    execute format('drop policy if exists "archive : fermée aux stagiaires" on public.%I', t);
    execute format('create policy "archive : fermée aux stagiaires" on public.%I as restrictive for all
      using (not public.is_member(session_id) or not public.session_archived(session_id))
      with check (not public.is_member(session_id) or not public.session_archived(session_id))', t);
  end loop;
end $$;

-- Lien du support : plus pour les participant·es d'une session archivée
create or replace function public.support_status(p_session uuid)
returns table (unlocked boolean, unlock_at timestamptz, url text, configured boolean)
language plpgsql stable security definer set search_path = public as $$
declare u boolean; at timestamptz; lnk text;
begin
  if not public.can_see(p_session) then raise exception 'accès refusé'; end if;
  select public.support_unlock_at(p_session) into at;
  select s.support_unlocked or (at is not null and now() >= at) into u from sessions s where s.id = p_session;
  select ss.url into lnk from session_support ss where ss.session_id = p_session;
  return query select u, at,
    case when public.manages(p_session) then lnk
         when u and not (public.is_member(p_session) and public.session_archived(p_session)) then lnk end,
    lnk is not null;
end $$;
