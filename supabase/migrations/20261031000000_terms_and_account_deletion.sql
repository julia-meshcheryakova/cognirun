-- Terms acceptance on the profile, and self-service account deletion.
--
--   profiles.terms_version / terms_accepted_at  which Terms & Privacy version the
--     user agreed to, and when (server time). Set only through accept_terms().
--   accept_terms(p_version)  records the caller's acceptance.
--   delete_my_account()      deletes the caller's auth user; profiles, runs and
--     run_answers go with it through the existing ON DELETE CASCADE chain.

alter table public.profiles
  add column terms_version text check (terms_version is null or char_length(terms_version) between 1 and 32),
  add column terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is 'Terms & Privacy version the user accepted (web/src/legal.js TERMS_VERSION).';

create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to accept the terms' using errcode = '42501';
  end if;
  if p_version is null or char_length(btrim(p_version)) not between 1 and 32 then
    raise exception 'invalid terms version' using errcode = '22023';
  end if;
  update public.profiles
     set terms_version = btrim(p_version), terms_accepted_at = now()
   where id = auth.uid();
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to delete your account' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.accept_terms(text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
