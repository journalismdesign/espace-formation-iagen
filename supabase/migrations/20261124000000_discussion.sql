-- =====================================================================
-- Discussion façon messagerie + accès réduit après la session
--  * posts.staff / threads.staff : le message vient de l'équipe pédagogique
--    (calculé côté serveur, jamais fourni par le client)
--  * chat_open(sid) : l'équipe garde la main ; les stagiaires lisent et
--    écrivent tant que la session n'est pas close
-- À exécuter après 20261123010000_reponses.sql
-- =====================================================================

alter table public.threads add column if not exists staff boolean not null default false;
alter table public.posts   add column if not exists staff boolean not null default false;

create or replace function public.mark_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.staff := public.manages(new.session_id);
  return new;
end $$;

drop trigger if exists threads_mark_staff on public.threads;
create trigger threads_mark_staff before insert on public.threads
  for each row execute function public.mark_staff();
drop trigger if exists posts_mark_staff on public.posts;
create trigger posts_mark_staff before insert on public.posts
  for each row execute function public.mark_staff();

-- Les messages déjà publiés par l'équipe
update public.posts p set staff = true
  where exists (select 1 from public.profiles pr where pr.id = p.author and pr.role in ('trainer', 'admin'));
update public.threads t set staff = true
  where exists (select 1 from public.profiles pr where pr.id = t.author and pr.role in ('trainer', 'admin'));

create or replace function public.chat_open(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.manages(sid)
      or (public.is_member(sid) and exists (select 1 from sessions s where s.id = sid and s.status <> 'closed'));
$$;
grant execute on function public.chat_open(uuid) to authenticated;

drop policy if exists "fil : lire" on public.threads;
create policy "fil : lire" on public.threads for select using (public.chat_open(session_id));
drop policy if exists "fil : écrire" on public.threads;
create policy "fil : écrire" on public.threads for insert with check (author = auth.uid() and public.chat_open(session_id));
drop policy if exists "message : lire" on public.posts;
create policy "message : lire" on public.posts for select using (public.chat_open(session_id));
drop policy if exists "message : écrire" on public.posts;
create policy "message : écrire" on public.posts for insert with check (author = auth.uid() and public.chat_open(session_id));

grant select on public.threads, public.posts to authenticated;
