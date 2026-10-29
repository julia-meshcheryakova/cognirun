-- CogniRun accounts, saved runs and challenges (thread T2).
--
--   profiles     1:1 with auth.users, created by a trigger on signup
--   runs         mirrors web/src/history/runRecord.js (RunRecord, schema 1);
--                the client-generated record id is the primary key so sync is idempotent
--   run_answers  one row per answer, for per-category stats and question analytics
--   challenges   fixed question sets everyone runs ('2026-W02-5k')
--   challenge_leaderboard(challenge_id)  best run per user, display name + score fields only
--
-- RLS: users read and write only their own profile, runs and answers. Challenges are
-- readable by everyone and writable by admins (profiles.is_admin) or the service role.

-- ---------------------------------------------------------------- helpers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per account, created on signup by on_auth_user_created.';
comment on column public.profiles.is_admin is 'Admin page access. Only the service role (or SQL) can change it.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- True when the calling user is an admin. SECURITY DEFINER so policies can call it
-- without recursing into the profiles policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Display name from the signup metadata, the provider (Google full_name/name) or the
-- email's local part.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Runner'
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(name, 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: read own (admins read all)"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Rows are only created by the trigger, and users may change their display name only.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- runs

create table public.runs (
  id text primary key check (char_length(id) between 1 and 64),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  schema smallint not null default 1,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  mode text not null default 'solo' check (mode in ('solo', 'challenge')),
  challenge_id text,
  course text not null,
  demo boolean not null default false,
  distance_m double precision not null default 0 check (distance_m >= 0),
  duration_s double precision not null default 0 check (duration_s >= 0),
  avg_speed double precision not null default 0,
  points integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  hr_avg smallint,
  hr_max smallint,
  route jsonb not null default '[]'::jsonb check (jsonb_typeof(route) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- target of run_answers' composite foreign key, so an answer always belongs to its run's owner
  unique (id, user_id)
);

comment on table public.runs is 'Finished runs; mirrors RunRecord (web/src/history/runRecord.js). id is the client-generated record id.';
comment on column public.runs.challenge_id is 'challenges.id when run as a challenge. No foreign key: weekly challenge ids are deterministic and may be generated client-side before a row exists.';
comment on column public.runs.route is 'Downsampled route samples [{lat,lng,t,distance,speed,heartRate}] (at most 300).';

create index runs_user_finished_idx on public.runs (user_id, finished_at desc);
create index runs_challenge_idx on public.runs (challenge_id, points desc) where challenge_id is not null;

create trigger runs_updated_at
  before update on public.runs
  for each row execute function public.set_updated_at();

-- A finished run's result is final for users: re-uploading identical values is fine
-- (sync is an idempotent upsert) but the scored fields cannot be rewritten, and
-- created_at is always the server's upload time (the leaderboard uses it to refuse
-- late submissions). Admins and the service role can still correct data.
create or replace function public.runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  new.created_at := old.created_at;
  if (new.started_at, new.finished_at, new.mode, new.challenge_id, new.course, new.demo,
      new.distance_m, new.duration_s, new.points, new.correct, new.total)
     is distinct from
     (old.started_at, old.finished_at, old.mode, old.challenge_id, old.course, old.demo,
      old.distance_m, old.duration_s, old.points, old.correct, old.total) then
    raise exception 'the result of an uploaded run cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger runs_guard
  before insert or update on public.runs
  for each row execute function public.runs_guard();

alter table public.runs enable row level security;

create policy "runs: read own"
  on public.runs for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "runs: insert own"
  on public.runs for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "runs: update own"
  on public.runs for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "runs: delete own"
  on public.runs for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.runs from anon;

-- ---------------------------------------------------------------- run_answers

create table public.run_answers (
  run_id text not null,
  idx smallint not null check (idx >= 0),
  user_id uuid not null default auth.uid(),
  question_id text not null,
  category text not null,
  km smallint not null,
  elapsed_s double precision,
  text text not null default '',
  correct_answer text,
  correct boolean,
  points integer not null default 0,
  method text,
  primary key (run_id, idx),
  foreign key (run_id, user_id) references public.runs (id, user_id) on delete cascade
);

comment on table public.run_answers is 'RunRecord.answers[], one row per answer, in order (idx).';

create index run_answers_run_user_idx on public.run_answers (run_id, user_id);
create index run_answers_user_category_idx on public.run_answers (user_id, category);
create index run_answers_question_idx on public.run_answers (question_id);

alter table public.run_answers enable row level security;

create policy "run_answers: read own"
  on public.run_answers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "run_answers: insert own"
  on public.run_answers for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "run_answers: update own"
  on public.run_answers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "run_answers: delete own"
  on public.run_answers for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.run_answers from anon;

-- Per-category totals for the signed-in user (real runs only). security_invoker so the
-- caller's RLS applies and nobody sees anyone else's answers.
create view public.my_category_stats
with (security_invoker = true)
as
  select
    a.user_id,
    a.category,
    count(*)::integer as answered,
    (count(*) filter (where a.correct))::integer as correct,
    avg(a.elapsed_s) as avg_elapsed_s,
    sum(a.points)::integer as points
  from public.run_answers a
  join public.runs r on r.id = a.run_id
  where not r.demo
  group by a.user_id, a.category;

revoke all on public.my_category_stats from anon;
grant select on public.my_category_stats to authenticated;

-- ---------------------------------------------------------------- challenges

create table public.challenges (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,63}$'),
  course text not null,
  title text not null,
  theme text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  question_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

comment on table public.challenges is 'A fixed question set on a course for a time window, e.g. 2026-W02-5k.';

alter table public.challenges enable row level security;

create policy "challenges: everyone reads"
  on public.challenges for select
  to anon, authenticated
  using (true);

create policy "challenges: admins insert"
  on public.challenges for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "challenges: admins update"
  on public.challenges for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "challenges: admins delete"
  on public.challenges for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.challenges from anon;
grant select on public.challenges to anon;

-- ---------------------------------------------------------------- leaderboard

-- Best real (non-demo) run per user for a challenge: most points, then fastest, then
-- earliest. When the challenge row exists only runs finished inside its window and
-- uploaded at most a day after it closed (offline runs sync late) count.
-- SECURITY DEFINER because runs and profiles are private; it returns only the display
-- name and score fields, plus is_me so the caller can find their own row.
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
      and (c.id is null or (
        r.finished_at >= c.starts_at
        and r.finished_at < c.ends_at
        and r.created_at < c.ends_at + interval '1 day'
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

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
