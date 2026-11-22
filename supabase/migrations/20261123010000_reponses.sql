-- Réponses aux sondages et quiz : enregistrées par une fonction plutôt que par un « upsert » direct.
-- L'upsert de l'API réécrivait toutes les colonnes (dont user_id), ce que les droits par colonne refusent
-- (« permission denied for table responses »). La fonction n'écrit que la réponse de la personne connectée.
create or replace function public.submit_response(p_session uuid, p_activity text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'connectez-vous d''abord'; end if;
  if not public.is_member(p_session) then raise exception 'vous ne participez pas à cette session'; end if;
  if length(coalesce(p_activity, '')) not between 1 and 200 then raise exception 'activité inconnue'; end if;
  if pg_column_size(p_value) > 20000 then raise exception 'réponse trop longue'; end if;
  insert into responses (session_id, user_id, activity_id, value, created_at)
  values (p_session, auth.uid(), p_activity, p_value, now())
  on conflict (session_id, user_id, activity_id) do update set value = excluded.value, created_at = excluded.created_at;
end $$;
revoke execute on function public.submit_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_response(uuid, text, jsonb) to authenticated;
