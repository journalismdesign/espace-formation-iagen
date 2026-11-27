-- =====================================================================
-- Trames de conducteur : déroulés réutilisables, construits dans
-- l'éditeur (#/admin/trames) puis appliqués à une session.
--  * content : { formation, days, nDays, modules, slides_url?, slides_n? },
--    au schéma de sessions.programme (modules : séquences, pauses et
--    déjeuners ; acts : quiz et sondages joués en salle, clés de la
--    bibliothèque).
--  * Lue par l'équipe (pour l'appliquer à ses sessions), modifiée par
--    l'administration seule. Jamais lue par les stagiaires ni les invité·es.
-- Rejouable. À exécuter après 20261129000000_journees.sql
-- =====================================================================

create table if not exists public.conducteur_templates (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null check (length(btrim(titre)) between 1 and 120),
  content     jsonb not null default '{}'::jsonb
              check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 500000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table public.conducteur_templates enable row level security;

drop policy if exists "trame : lecture équipe" on public.conducteur_templates;
create policy "trame : lecture équipe" on public.conducteur_templates for select to authenticated using (public.is_trainer());
drop policy if exists "trame : ajout admin" on public.conducteur_templates;
create policy "trame : ajout admin" on public.conducteur_templates for insert to authenticated with check (public.is_admin());
drop policy if exists "trame : modification admin" on public.conducteur_templates;
create policy "trame : modification admin" on public.conducteur_templates for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "trame : suppression admin" on public.conducteur_templates;
create policy "trame : suppression admin" on public.conducteur_templates for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.conducteur_templates to authenticated;

-- Date et auteur de la dernière modification, tenus par la base
create or replace function public.conducteur_templates_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke execute on function public.conducteur_templates_touch() from public, anon, authenticated;
drop trigger if exists conducteur_templates_touch on public.conducteur_templates;
create trigger conducteur_templates_touch before insert or update on public.conducteur_templates
  for each row execute function public.conducteur_templates_touch();
