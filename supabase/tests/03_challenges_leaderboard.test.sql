-- Challenges are public and admin-written; the leaderboard shows each user's best
-- real run with only their display name and score fields.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@example.com', '{"full_name": "Alice"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@example.com', '{"full_name": "Bob"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@example.com', '{"full_name": "Carol"}');
update public.profiles set is_admin = true where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

insert into public.challenges (id, course, title, starts_at, ends_at, question_ids) values
  ('2026-W02-5k', '5k', 'Week 2 · 5K', '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z', '{t1,l1,m1,t2,l2}');

-- Seeded as the service role would: RLS and the upload-time guard are bypassed here.
insert into public.runs (id, user_id, started_at, finished_at, mode, challenge_id, course, demo, duration_s, points, correct, total, created_at) values
  ('a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-06T09:00:00Z', '2026-01-06T09:30:00Z', 'challenge', '2026-W02-5k', '5k', false, 1800, 200, 4, 5, '2026-01-06T09:31:00Z'),
  ('a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-07T09:00:00Z', '2026-01-07T09:31:00Z', 'challenge', '2026-W02-5k', '5k', false, 1860, 250, 5, 5, '2026-01-07T09:32:00Z'),
  ('a3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-08T09:00:00Z', '2026-01-08T09:01:00Z', 'challenge', '2026-W02-5k', '5k', true, 60, 500, 5, 5, '2026-01-08T09:02:00Z'),
  ('b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-06T09:00:00Z', '2026-01-06T09:28:00Z', 'challenge', '2026-W02-5k', '5k', false, 1680, 250, 5, 5, '2026-01-06T09:29:00Z'),
  ('b2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-13T09:00:00Z', '2026-01-13T09:20:00Z', 'challenge', '2026-W02-5k', '5k', false, 1200, 400, 5, 5, '2026-01-13T09:21:00Z'),
  -- finished inside the window but uploaded more than a day after it closed
  ('b4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-11T09:00:00Z', '2026-01-11T09:20:00Z', 'challenge', '2026-W02-5k', '5k', false, 1200, 450, 5, 5, '2026-01-14T00:00:00Z'),
  ('b3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-06T09:00:00Z', '2026-01-06T09:28:00Z', 'challenge', 'friend-xyz', '3k', false, 900, 150, 3, 3, '2026-01-06T09:29:00Z'),
  ('c1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-01-06T09:00:00Z', '2026-01-06T09:28:00Z', 'solo', null, '5k', false, 1680, 300, 5, 5, '2026-01-06T09:29:00Z');

  -- Full-course distances and the answers that add up to each score (see 05_score_plausibility).
  update public.runs set distance_m = public.course_meters(course);
  insert into public.run_answers (run_id, idx, user_id, question_id, category, km, correct, points)
  select r.id, g, r.user_id, 'q' || g, 'trivia', g + 1, true,
         case when g = 0 then r.points - (r.total - 1) * (r.points / r.total) else r.points / r.total end
  from public.runs r, generate_series(0, r.total - 1) g;
-- ---------------------------------------------------------------- challenges
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.challenges), 1, 'anyone can read challenges');
select throws_ok(
  $$insert into public.challenges (id, course, title, starts_at, ends_at) values ('x', '3k', 'x', now(), now() + interval '1 day')$$,
  '42501',
  null,
  'anon cannot create challenges'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.challenges (id, course, title, starts_at, ends_at) values ('mine', '3k', 'Mine', now(), now() + interval '1 day')$$,
  '42501',
  null,
  'a normal user cannot create challenges'
);
update public.challenges set title = 'Hacked' where id = '2026-W02-5k';
select is((select title from public.challenges where id = '2026-W02-5k'), 'Week 2 · 5K', 'nor edit them');

select set_config('request.jwt.claims', '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.challenges (id, course, title, theme, starts_at, ends_at) values ('2026-W02-10k', '10k', 'Week 2 · 10K', 'capitals', '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z')$$,
  'an admin can create challenges'
);
select lives_ok(
  $$update public.challenges set title = 'Week 2 · 10K (capitals)' where id = '2026-W02-10k'$$,
  'and edit them'
);
select throws_ok(
  $$insert into public.challenges (id, course, title, starts_at, ends_at) values ('bad id!', '3k', 'x', now(), now() + interval '1 day')$$,
  '23514',
  null,
  'challenge ids are slugs'
);

-- ---------------------------------------------------------------- leaderboard
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select results_eq(
  $$select rank, display_name, points, correct, is_me from public.challenge_leaderboard('2026-W02-5k')$$,
  $$values (1::bigint, 'Bob'::text, 250, 5, false), (2::bigint, 'Alice'::text, 250, 5, true)$$,
  'best real run per user inside the window (late uploads excluded), ties broken by time'
);
select is(
  (select count(*)::int from public.challenge_leaderboard('2026-W02-5k', 1)),
  1,
  'the limit is applied'
);
select results_eq(
  $$select display_name, points from public.challenge_leaderboard('friend-xyz')$$,
  $$values ('Bob'::text, 150)$$,
  'a challenge without a row counts every run tagged with it'
);
select is(
  (select proargnames from pg_proc where oid = 'public.challenge_leaderboard(text, integer)'::regprocedure),
  array['p_challenge_id', 'p_limit', 'rank', 'display_name', 'points', 'correct', 'total',
        'duration_s', 'distance_m', 'finished_at', 'is_me'],
  'it exposes only the display name and score fields (no user ids, emails or routes)'
);
select is(
  (select count(*)::int from public.runs where user_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'while other people''s runs stay private'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  $$select display_name, is_me from public.challenge_leaderboard('2026-W02-5k')$$,
  $$values ('Bob'::text, false), ('Alice'::text, false)$$,
  'signed-out visitors can read the leaderboard too'
);

reset role;
select * from finish();
rollback;
