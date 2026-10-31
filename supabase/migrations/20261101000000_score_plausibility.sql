-- Score plausibility. Scores are still computed on the device, so the server
-- cannot prove a run is honest, but it can refuse results the app never
-- produces and keep implausible runs off the public leaderboards.
--
-- Scoring rules mirrored here (web/src/scoring.js, web/src/history/runRecord.js):
--   * one answer earns at most 100 points; a wrong answer earns 0;
--   * a run's points are the sum of its answers' points, total = number of answers;
--   * a 10K asks 10 questions, the most of any course.

-- `not valid`: enforced for every new or changed row, existing rows are not rechecked.
alter table public.runs
  add constraint runs_points_nonnegative check (points >= 0) not valid,
  add constraint runs_total_range check (total between 0 and 50) not valid,
  add constraint runs_correct_range check (correct between 0 and total) not valid,
  add constraint runs_points_max check (points <= 100 * total) not valid;

alter table public.run_answers
  add constraint run_answers_points_range check (points between 0 and 100) not valid,
  add constraint run_answers_wrong_scores_zero check (correct is distinct from false or points = 0) not valid,
  add constraint run_answers_elapsed_nonnegative check (elapsed_s is null or elapsed_s >= 0) not valid;

/** Course length in metres (web/src/config.js COURSES); null for unknown courses. */
create or replace function public.course_meters(p_course text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case p_course
    when '3k' then 3000
    when '5k' then 5000
    when '10k' then 10000
    when '300m' then 300
    when '60m' then 60
  end::double precision;
$$;

/**
 * Whether a run's result is believable enough for a public leaderboard:
 *   * a real pace: the average is no faster than 6.5 m/s (2:34 per km, quicker
 *     than the 10K world record), and the run took some time;
 *   * its uploaded answers add up to its total and points.
 */
create or replace function public.run_is_plausible(r public.runs)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.duration_s > 0
    and r.distance_m <= r.duration_s * 6.5
    and (
      select count(*) = r.total and coalesce(sum(a.points), 0) = r.points
      from public.run_answers a
      where a.run_id = r.id
    );
$$;

revoke all on function public.run_is_plausible(public.runs) from public, anon, authenticated;

create or replace function public.challenge_leaderboard(p_challenge_id text, p_limit integer default 100)
returns table (
  rank bigint,
  display_name text,
  points integer,
  correct integer,
  total integer,
  duration_s double precision,
  distance_m double precision,
  finished_at timestamptz,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select r.*
    from public.runs r
    left join public.challenges c on c.id = r.challenge_id
    where r.challenge_id = p_challenge_id
      and not r.demo
      and public.run_is_plausible(r)
      and (c.id is null or (
        r.finished_at >= c.starts_at
        and r.finished_at < c.ends_at
        and r.created_at < c.ends_at + interval '1 day'
        -- the whole course, on the challenge's course (GPS rounding: 1 m slack)
        and r.course = c.course
        and r.distance_m >= public.course_meters(c.course) - 1
      ))
  ),
  best as (
    select distinct on (e.user_id) e.*
    from eligible e
    order by e.user_id, e.points desc, e.duration_s asc, e.finished_at asc
  )
  select
    rank() over (order by b.points desc, b.duration_s asc),
    p.display_name,
    b.points,
    b.correct,
    b.total,
    b.duration_s,
    b.distance_m,
    b.finished_at,
    coalesce(b.user_id = auth.uid(), false)
  from best b
  join public.profiles p on p.id = b.user_id
  order by 1, b.finished_at
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.challenge_leaderboard(text, integer) from public;
grant execute on function public.challenge_leaderboard(text, integer) to anon, authenticated;
