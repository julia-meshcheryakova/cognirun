-- Scores are computed on the device: the database refuses results the app never
-- produces, and the leaderboard ignores runs that are not believable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@example.com', '{"full_name": "Alice"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@example.com', '{"full_name": "Bob"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@example.com', '{"full_name": "Carol"}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dan@example.com', '{"full_name": "Dan"}'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'erin@example.com', '{"full_name": "Erin"}');

insert into public.challenges (id, course, title, starts_at, ends_at, question_ids) values
  ('2026-W02-3k', '3k', 'Week 2 3K', '2026-01-05T00:00:00Z', '2026-01-12T00:00:00Z', '{t1,l1,m1}');

-- Seeded as the service role would (the upload-time guard is bypassed).
insert into public.runs (id, user_id, started_at, finished_at, mode, challenge_id, course, distance_m, duration_s, points, correct, total, created_at) values
  -- honest: 3 km in 15 minutes, answers add up
  ('ok', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-06T09:00:00Z', '2026-01-06T09:15:00Z', 'challenge', '2026-W02-3k', '3k', 3000, 900, 240, 3, 3, '2026-01-06T09:16:00Z'),
  -- 3 km in 5 minutes: 10 m/s
  ('fast', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-01-06T09:00:00Z', '2026-01-06T09:05:00Z', 'challenge', '2026-W02-3k', '3k', 3000, 300, 300, 3, 3, '2026-01-06T09:06:00Z'),
  -- stopped after 2 km
  ('short', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-01-06T09:00:00Z', '2026-01-06T09:10:00Z', 'challenge', '2026-W02-3k', '3k', 2000, 600, 300, 3, 3, '2026-01-06T09:11:00Z'),
  -- points that its answers do not add up to
  ('padded', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-01-06T09:00:00Z', '2026-01-06T09:15:00Z', 'challenge', '2026-W02-3k', '3k', 3000, 900, 300, 3, 3, '2026-01-06T09:16:00Z'),
  -- a 5K run tagged with the 3K challenge
  ('wrongcourse', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '2026-01-06T09:00:00Z', '2026-01-06T09:25:00Z', 'challenge', '2026-W02-3k', '5k', 5000, 1500, 300, 3, 3, '2026-01-06T09:26:00Z');

insert into public.run_answers (run_id, idx, user_id, question_id, category, km, correct, points)
select r.id, g, r.user_id, 'q' || g, 'trivia', g + 1, true, r.points / r.total
from public.runs r, generate_series(0, r.total - 1) g
where r.id <> 'padded';
insert into public.run_answers (run_id, idx, user_id, question_id, category, km, correct, points) values
  ('padded', 0, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'q0', 'trivia', 1, true, 50),
  ('padded', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'q1', 'trivia', 2, true, 50),
  ('padded', 2, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'q2', 'trivia', 3, true, 50);

-- ---------------------------------------------------------------- leaderboard
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  $$select display_name, points from public.challenge_leaderboard('2026-W02-3k')$$,
  $$values ('Alice'::text, 240)$$,
  'only the believable run is ranked: too fast, too short, padded and wrong-course runs are left out'
);
select throws_ok(
  $$select public.run_is_plausible(r) from public.runs r$$,
  '42501',
  null,
  'the plausibility helper is not callable directly'
);

-- ---------------------------------------------------------------- upload checks
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.runs (id, started_at, finished_at, course, distance_m, duration_s, points, correct, total)
    values ('fine', now() - interval '20 minutes', now(), '3k', 3000, 1200, 300, 3, 3)$$,
  'an ordinary run uploads'
);
select throws_ok(
  $$insert into public.runs (id, started_at, finished_at, course, points, correct, total)
    values ('neg', now(), now(), '3k', -1, 0, 3)$$,
  '23514', null, 'points cannot be negative'
);
select throws_ok(
  $$insert into public.runs (id, started_at, finished_at, course, points, correct, total)
    values ('over', now(), now(), '3k', 301, 3, 3)$$,
  '23514', null, 'a run earns at most 100 points per question'
);
select throws_ok(
  $$insert into public.runs (id, started_at, finished_at, course, points, correct, total)
    values ('morecorrect', now(), now(), '3k', 100, 4, 3)$$,
  '23514', null, 'correct answers cannot exceed the questions asked'
);
select throws_ok(
  $$insert into public.runs (id, started_at, finished_at, course, points, correct, total)
    values ('huge', now(), now(), '3k', 0, 0, 51)$$,
  '23514', null, 'the number of questions is bounded'
);

select lives_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km, correct, points, elapsed_s)
    values ('fine', 0, 'q0', 'trivia', 1, true, 100, 3), ('fine', 1, 'q1', 'logic', 2, null, 75, 30)$$,
  'graded and ungraded answers upload'
);
select throws_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km, correct, points)
    values ('fine', 2, 'q2', 'math', 3, true, 101)$$,
  '23514', null, 'an answer earns at most 100 points'
);
select throws_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km, correct, points)
    values ('fine', 2, 'q2', 'math', 3, false, 10)$$,
  '23514', null, 'a wrong answer earns nothing'
);
select throws_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km, correct, points, elapsed_s)
    values ('fine', 2, 'q2', 'math', 3, true, 10, -1)$$,
  '23514', null, 'answer time cannot be negative'
);

reset role;
select is(public.course_meters('10k'), 10000::double precision, 'course lengths mirror the app''s courses');

select * from finish();
rollback;
