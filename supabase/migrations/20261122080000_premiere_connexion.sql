-- Première connexion formateur : code temporaire reçu par e-mail, puis choix du code d'accès.
-- Le rôle formateur n'était attribué qu'à la création du compte : une adresse ajoutée
-- à trainer_emails après une première connexion restait « stagiaire ». On corrige.

-- 1. Rattrapage des comptes existants
update public.profiles p set role = 'trainer'
where p.role <> 'trainer' and exists (select 1 from public.trainer_emails t where t.email = lower(p.email));

-- 2. Toute adresse ajoutée ensuite promeut le compte s'il existe déjà
create or replace function public.promote_trainer_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set role = 'trainer' where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists on_trainer_email_added on public.trainer_emails;
create trigger on_trainer_email_added after insert on public.trainer_emails
  for each row execute function public.promote_trainer_email();

-- 3. Appelée juste après la vérification du code e-mail : renvoie vrai si le compte est formateur
create or replace function public.claim_trainer() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(email) into v_email from profiles where id = auth.uid();
  if v_email is null then return false; end if;
  if exists (select 1 from trainer_emails where email = v_email) then
    update profiles set role = 'trainer' where id = auth.uid() and role <> 'trainer';
    return true;
  end if;
  return public.is_trainer();
end $$;
revoke execute on function public.claim_trainer() from public, anon;
grant execute on function public.claim_trainer() to authenticated;
