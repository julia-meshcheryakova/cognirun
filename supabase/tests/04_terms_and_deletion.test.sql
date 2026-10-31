-- Terms acceptance and self-service account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dave@example.com');

-- ---------------------------------------------------------------- as Carol
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}', true);

select is(
  (select terms_version from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  null,
  'a new account has not accepted any terms'
);
select throws_ok(
  $$update public.profiles set terms_version = 'forged' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '42501', null,
  'terms_version cannot be written directly'
);
select lives_ok($$select public.accept_terms('2026-10-31')$$, 'a user can accept the terms');
select is(
  (select terms_version from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  '2026-10-31',
  'the accepted version is recorded'
);
select isnt(
  (select terms_accepted_at from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  null,
  'with a server timestamp'
);
select throws_ok($$select public.accept_terms('  ')$$, '22023', null, 'a blank version is rejected');

insert into public.runs (id, started_at, finished_at, course, distance_m, duration_s, points, correct, total)
  values ('run-c', '2026-01-05T09:45:00Z', '2026-01-05T10:00:00Z', '3k', 3000, 900, 90, 1, 1);
insert into public.run_answers (run_id, idx, question_id, category, km, text, correct, points)
  values ('run-c', 0, 't1', 'trivia', 1, 'Paris', true, 90);

select lives_ok($$select public.delete_my_account()$$, 'a user can delete their account');

reset role;
select is((select count(*)::int from auth.users where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 0, 'the auth user is gone');
select is((select count(*)::int from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 0, 'with the profile');
select is(
  (select count(*)::int from public.runs where id = 'run-c') + (select count(*)::int from public.run_answers where run_id = 'run-c'),
  0,
  'and every run and answer'
);
select is((select count(*)::int from auth.users where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 1, 'other accounts are untouched');

-- Signed-out visitors can call neither function.
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'anon cannot delete accounts');

reset role;
select * from finish();
rollback;
