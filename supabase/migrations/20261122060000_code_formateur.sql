-- Code d'accès à l'espace formateur : vérifié côté serveur, stocké sous forme d'empreinte,
-- illisible par tout client. Définir ou changer le code (SQL Editor) :
--   select public.set_trainer_code('votre-code-secret');
create table if not exists public.private_settings (
  key    text primary key,
  value  text
);
alter table public.private_settings enable row level security;
revoke all on public.private_settings from anon, authenticated;

create or replace function public.trainer_code_configured() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from private_settings where key = 'trainer_code_hash');
$$;

create or replace function public.check_trainer_code(p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (select 1 from private_settings where key = 'trainer_code_hash'
                 and value = encode(sha256(convert_to(trim(coalesce(p_code, '')), 'UTF8')), 'hex')) into ok;
  if not ok then perform pg_sleep(0.6); end if;  -- freine les essais en rafale
  return ok;
end $$;

-- Depuis le SQL Editor (sans utilisateur) ou par un formateur connecté
create or replace function public.set_trainer_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- appel par l'API (jeton présent) : formateur obligatoire ; SQL Editor (pas de jeton) : autorisé
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' and not public.is_trainer() then
    raise exception 'réservé aux formateurs';
  end if;
  if length(trim(coalesce(p_code, ''))) < 6 then raise exception 'le code doit compter au moins 6 caractères'; end if;
  insert into private_settings (key, value) values ('trainer_code_hash', encode(sha256(convert_to(trim(p_code), 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;
end $$;

grant execute on function public.trainer_code_configured(), public.check_trainer_code(text) to anon, authenticated;
grant execute on function public.set_trainer_code(text) to authenticated;
