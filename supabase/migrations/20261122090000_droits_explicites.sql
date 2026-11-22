-- Droits explicites sur les tables et fonctions.
-- Les projets Supabase récents n'accordent plus automatiquement l'accès aux tables
-- créées en SQL (« permission denied for table … »). On les accorde ici une fois pour toutes ;
-- les règles RLS restent le seul filtre sur les lignes.

grant usage on schema public to anon, authenticated, service_role;

-- Lecture pour les comptes connectés (RLS filtre ensuite les lignes)
grant select on
  public.profiles, public.sessions, public.session_members, public.session_invites,
  public.projects, public.responses, public.resources, public.session_secrets,
  public.threads, public.posts, public.brands, public.app_settings,
  public.session_support, public.trainers
to authenticated;

-- Écritures (mêmes droits que dans les migrations précédentes, réaffirmés)
grant update (full_name, metier, niveau, outils) on public.profiles to authenticated;
grant insert, update, delete on public.sessions, public.session_invites, public.resources, public.session_secrets to authenticated;
grant update (progress) on public.session_members to authenticated;
grant delete on public.session_members to authenticated;
grant insert (session_id, data, status, validated_at, question) on public.projects to authenticated;
grant update (data, status, validated_at, question, updated_at) on public.projects to authenticated;
grant insert (session_id, activity_id, value), update (value, created_at) on public.responses to authenticated;
grant insert (session_id, title, body), delete on public.threads to authenticated;
grant insert (thread_id, session_id, body), delete on public.posts to authenticated;
grant insert, update, delete on public.brands, public.app_settings, public.session_support, public.trainers to authenticated;

-- Jamais lisibles depuis le navigateur (on ignore les tables pas encore créées)
do $$
declare t text;
begin
  foreach t in array array['trainer_emails','ai_usage','access_codes','private_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- Fonctions Edge (clé service_role) : accès complet
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Appels RPC : chaque fonction vérifie elle-même les droits (is_trainer, is_member…)
grant execute on all functions in schema public to authenticated;
grant execute on function public.session_public(text), public.trainer_code_configured(), public.check_trainer_code(text) to anon;
