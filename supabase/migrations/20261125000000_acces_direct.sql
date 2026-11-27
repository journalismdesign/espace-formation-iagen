-- =====================================================================
-- Accès direct (fonction access, action « grant ») : l'équipe inscrit une
-- personne qui ne reçoit pas l'e-mail (prénom + adresse). Celle-ci entre une
-- seule fois en tapant son adresse sur la page d'entrée, sans code.
-- Rejouable sans erreur. À exécuter après 20261124040000_durcissement.sql,
-- puis redéployer la fonction access.
-- =====================================================================

-- Accès accordés, jamais lisibles par un client. Une ligne par personne et par session,
-- effacée à la première entrée, à l'expiration ou à la clôture de la session.
create table if not exists public.access_passes (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  email       text not null check (email = lower(email)),
  first_name  text not null default '',
  expires_at  timestamptz not null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (session_id, email)
);
alter table public.access_passes enable row level security;
revoke all on public.access_passes from public, anon, authenticated;
grant all on public.access_passes to service_role;

-- La purge (horaire et à chaque appel de la fonction access) efface aussi les accès directs périmés
create or replace function public.purge_access_codes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from access_codes a using sessions s
   where a.session_id = s.id and (a.expires_at < now() or s.status = 'closed');
  get diagnostics n = row_count;
  delete from access_passes p using sessions s
   where p.session_id = s.id and (p.expires_at < now() or s.status = 'closed');
  delete from access_throttle where win_start < now() - interval '2 days';
  return n;
end $$;

-- À la clôture, codes et accès directs disparaissent ensemble
create or replace function public.on_session_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' then
    delete from access_codes where session_id = new.id;
    delete from access_passes where session_id = new.id;
  end if;
  return new;
end $$;
