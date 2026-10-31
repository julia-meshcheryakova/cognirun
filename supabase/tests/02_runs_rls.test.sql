-- Runs and answers: each user reads and writes only their own; sync upserts are idempotent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@example.com');

-- ---------------------------------------------------------------- as Alice
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.runs (id, started_at, finished_at, course, distance_m, duration_s, points, correct, total, route)
    values ('run-a', '2026-01-05T09:45:00Z', '2026-01-05T10:00:00Z', '3k', 3000, 900, 90, 1, 2,
            '[{"lat": 52, "lng": 4, "t": 0, "distance": 0, "speed": 0, "heartRate": 0}]')$$,
  'a user can save a run (user_id defaults to them)'
);
select is(
  (select user_id::text from public.runs where id = 'run-a'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'the run belongs to the caller'
);
select lives_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km, elapsed_s, text, correct_answer, correct, points, method)
    values ('run-a', 0, 't1', 'trivia', 1, 4.2, 'Paris', 'Paris', true, 90, 'exact'),
           ('run-a', 1, 'l1', 'logic', 2, 9, '', '7', false, 0, 'empty')$$,
  'and its answers'
);
select lives_ok(
  $$insert into public.runs (id, started_at, finished_at, course, distance_m, duration_s, points, correct, total, route)
    values ('run-a', '2026-01-05T09:45:00Z', '2026-01-05T10:00:00Z', '3k', 3000, 900, 90, 1, 2, '[]')
    on conflict (id) do update set
      started_at = excluded.started_at, finished_at = excluded.finished_at, course = excluded.course,
      distance_m = excluded.distance_m, duration_s = excluded.duration_s, points = excluded.points,
      correct = excluded.correct, total = excluded.total, route = excluded.route$$,
  'uploading the same run again is an idempotent upsert'
);
select is((select count(*)::int from public.runs), 1, 'so there is still one run');
select is((select jsonb_array_length(route) from public.runs where id = 'run-a'), 0, 'with the latest non-scored values');
select throws_ok(
  $$update public.runs set points = 999 where id = 'run-a'$$,
  '42501',
  null,
  'but the result of an uploaded run cannot be rewritten'
);
select throws_ok(
  $$update public.runs set finished_at = '2026-01-04T10:00:00Z' where id = 'run-a'$$,
  '42501',
  null,
  'including when it finished'
);
select lives_ok(
  $$insert into public.runs (id, started_at, finished_at, course, created_at)
    values ('run-a2', '2026-01-06T09:45:00Z', '2026-01-06T10:00:00Z', '3k', '2020-01-01T00:00:00Z')$$,
  'a run can be uploaded later than it finished'
);
select is((select created_at from public.runs where id = 'run-a2'), now(), 'and its upload time is set by the server');
select results_eq(
  'select category, answered, correct from public.my_category_stats order by category',
  $$values ('logic'::text, 1, 0), ('trivia'::text, 1, 1)$$,
  'per-category stats come from the answers'
);

-- ---------------------------------------------------------------- as Bob
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select is((select count(*)::int from public.runs), 0, 'another user cannot see the run');
select is((select count(*)::int from public.run_answers), 0, 'nor its answers');
select is((select count(*)::int from public.my_category_stats), 0, 'nor its stats');
select throws_ok(
  $$insert into public.runs (id, user_id, started_at, finished_at, course)
    values ('run-forged', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now(), '3k')$$,
  '42501',
  null,
  'nor save a run as someone else'
);
select throws_ok(
  $$insert into public.runs (id, started_at, finished_at, course, points, total)
    values ('run-a', now(), now(), '3k', 999, 10)
    on conflict (id) do update set points = excluded.points$$,
  '42501',
  null,
  'nor overwrite their run by upserting its id'
);
select throws_ok(
  $$insert into public.run_answers (run_id, idx, question_id, category, km)
    values ('run-a', 5, 'm1', 'math', 3)$$,
  '23503',
  null,
  'nor attach answers to it as themselves'
);
select throws_ok(
  $$insert into public.run_answers (run_id, idx, user_id, question_id, category, km)
    values ('run-a', 5, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'm1', 'math', 3)$$,
  '42501',
  null,
  'nor as its owner'
);
update public.runs set points = 0 where id = 'run-a';
delete from public.runs where id = 'run-a';
delete from public.run_answers where run_id = 'run-a';

-- ---------------------------------------------------------------- back as Alice
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select is((select points from public.runs where id = 'run-a'), 90, 'another user''s update and delete change nothing');
select is((select count(*)::int from public.run_answers), 2, 'and the answers are intact');
select lives_ok($$delete from public.runs where id = 'run-a'$$, 'the owner can delete the run');
select is((select count(*)::int from public.run_answers), 0, 'which deletes its answers too');

-- ---------------------------------------------------------------- signed out
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from public.runs', '42501', null, 'anon cannot read runs');

reset role;
select * from finish();
rollback;
