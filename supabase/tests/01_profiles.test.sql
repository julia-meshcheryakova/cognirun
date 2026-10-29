-- Profiles: created by the signup trigger, readable and renamable by their owner only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name": "Alice Runner"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob.smith@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', null, '{"name": "  "}');

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice Runner',
  'the provider''s full name becomes the display name'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob.smith',
  'otherwise the email''s local part does'
);
select is(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'Runner',
  'and with neither it falls back to Runner'
);
select is(
  (select count(*)::int from public.profiles where is_admin),
  0,
  'new accounts are not admins'
);

-- As Alice
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq(
  'select id::text from public.profiles',
  $$values ('11111111-1111-1111-1111-111111111111')$$,
  'a user sees only their own profile'
);
select lives_ok(
  $$update public.profiles set display_name = 'Speedy' where id = '11111111-1111-1111-1111-111111111111'$$,
  'a user can rename themselves'
);
select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Speedy',
  'the new name is stored'
);
select throws_ok(
  $$update public.profiles set display_name = '   ' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'a blank display name is rejected'
);
select throws_ok(
  $$update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a user cannot make themselves admin'
);
select throws_ok(
  $$insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Ghost')$$,
  '42501',
  null,
  'profiles cannot be inserted by users'
);
update public.profiles set display_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
select is(public.is_admin(), false, 'is_admin() is false for a normal user');

reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob.smith',
  'a user cannot rename someone else'
);

-- Admins can read every profile (for the admin page).
update public.profiles set is_admin = true where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.profiles), 3, 'an admin reads every profile');

-- Signed-out visitors see nothing.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');

reset role;
select * from finish();
rollback;
