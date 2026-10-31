-- Error reports go in only through log_client_error() and only admins read them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@example.com', '{"full_name": "Alice"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@example.com', '{"full_name": "Carol"}');
update public.profiles set is_admin = true where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- an old report, due for removal
insert into public.app_log (created_at, level, message) values (now() - interval '31 days', 'error', 'ancient');

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select ok(public.log_client_error('error', '  boom  ', 'at x', '/#/history', '0.1.0', 'UA'), 'a signed-out visitor can report an error');
select ok(not public.log_client_error('error', '   '), 'an empty message is ignored');
select throws_ok(
  $$insert into public.app_log (level, message) values ('error', 'direct')$$,
  '42501', null, 'the table cannot be written directly'
);
select throws_ok($$select count(*) from public.app_log$$, '42501', null, 'nor read by visitors');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select ok(public.log_client_error('warn', repeat('x', 900)), 'a signed-in user can report');
select is((select count(*)::int from public.app_log), 0, 'but cannot read any reports');
select is(
  (select count(*)::int from generate_series(1, 12) g where public.log_client_error('error', 'loop ' || g)),
  9,
  'one account is throttled to 10 reports a minute'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}', true);
select is((select count(*)::int from public.app_log), 11, 'an admin reads every report');
select results_eq(
  $$select message, stack, url, app_version, user_agent, user_id is null from public.app_log where level = 'error' and user_id is null$$,
  $$values ('boom'::text, 'at x'::text, '/#/history'::text, '0.1.0'::text, 'UA'::text, true)$$,
  'fields are trimmed and stored, without an account for visitors'
);
select is(
  (select char_length(message) from public.app_log where level = 'warn'),
  500,
  'long messages are cut to 500 characters'
);
select is((select count(*)::int from public.app_log where message = 'ancient'), 0, 'reports older than 30 days are removed');

reset role;
select * from finish();
rollback;
