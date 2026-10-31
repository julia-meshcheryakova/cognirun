# Challenges and leaderboard memo

Scope: the Challenges tab, weekly challenge schedule and question sets, entries, the
`challenge_leaderboard` RPC, and the results-page leaderboard. Files:
`web/src/challenges/{schedule,entries,leaderboard}.js`, `web/src/ui/challenges.js`,
`web/src/leaderboard.js`, `question-server/select.js`, `supabase/migrations/*`,
`supabase/tests/0{3,5}_*.sql`. Starting and running the run itself is in `run-flow.md`.

## Today's behaviour

- **Challenges** lists this ISO week's 3K, 5K and 10K (weeks run Monday 00:00 UTC to the
  next Monday), with question count, "easy → hard", your best and attempt counts, and
  "ends in 3d 7h". Past challenges you ran are listed below.
- Ids are computed on the device (`2026-W44-5k`); nothing is fetched to know the week.
  The question set is computed from the id and the bundled bank, one question per km.
- **Run 5K** (or **Try in demo**) starts a run on that course with those questions. On
  finish the run is saved with `challengeId`; the results page shows a **synthetic**
  leaderboard of six made-up runners.
- Your best = most points, then fastest, among non-demo full-distance runs with that id.
  Demo attempts are shown as "(not counted)".
- **Leaderboard & attempts** opens the detail page: date range, the real leaderboard
  (top 50 from the RPC, your row highlighted) and your own counted runs.
- Only synced runs reach the board, so you must be signed in. Signed-out visitors still
  see the board (the RPC is granted to `anon`).

## Facts checked against code

| Claim | Evidence (file:line) | Verdict |
| --- | --- | --- |
| ISO weeks are right across year ends (incl. 2026-W53) | `schedule.js:6-23`; I ran every 6 h from 2000 to 2040: date always inside `weekStart(isoWeek(d))`, and `challengeWeekIndex` steps by exactly 1 per week | confirmed |
| "Consecutive weeks of the same length share no question, including across year ends" (QUESTIONS-SPEC §5) | `select.js:107-125`; I built every 3K/5K/10K set for 163 weeks (Dec 2025 to Jan 2029): 0 overlaps, 0 repeats inside a set | confirmed |
| Question count is one per km | `select.js:77-81` equals `config.js:17-20` for 3k/5k/10k (checked in node) | confirmed |
| "Every device (and the server) agrees on this week's challenges" | `schedule.js:33-34`; the server never computes weeks: the RPC only looks up a `challenges` row (`20261101000000_score_plausibility.sql:81,85`) | **wrong** (server half) |
| The question server maps the bank to challenges | `select.js` is only imported by `web/src/questions.js:6-12` and tests; `server.mjs` never imports it, and its `/questions` returns the raw bank (`server.mjs:184-190`; it also serves `/api/tts`, `/api/stt`, `/api/judge`, `/api/config`, `:158-170`) | **wrong**: shared pure code, the server never selects |
| SUPABASE.md:34-38: late or backdated runs, short runs and other courses don't count | the checks are inside `c.id is null or (...)` (`score_plausibility.sql:85-92`); nothing creates weekly rows (`git grep "from('challenges')"` → none) | **wrong** for every challenge the app offers (bug 1) |
| SUPABASE.md:152: "Admins can create and edit `challenges` from the app" | no code reads or writes `challenges` (same grep) | **wrong** |
| About page: "To count, a run has to cover the whole distance at a believable pace" | client: distance only (`entries.js:9-16`); server: pace only (`run_is_plausible`, `score_plausibility.sql:44-56`) | **wrong** (half each side) |
| "Everyone gets the same questions" (`ui/challenges.js:93`) | sets come from the bundled bank (`ui/challenges.js:201` → `select.js:110` default `QUESTION_LIBRARY`) | confirmed only for the same bank version (an older APK differs) |
| Leaderboard exposes no user ids, emails or routes; legal page says the same | RPC columns `accounts_runs.sql:317-327` are rank, name, points, correct, total, `duration_s`, `distance_m`, exact `finished_at`, `is_me`; pgTAP `03:90-95`; `ui/legal.js:21`. The client keeps only name, points, duration, `isMe` (`challenges/leaderboard.js:15-20`) | confirmed (not "name and score only") |
| Client and server rank the same way | `entries.js:23-29` vs `score_plausibility.sql:95-98` (points desc, duration asc, finished asc) | confirmed |
| `web/src/leaderboard.js` is "demo-only" | `leaderboard.js:2-4`, but `results.js:127` passes `leaderboard: true` for every run; `history-ui.test.mjs:144` asserts it for a non-demo run | **wrong** (bug 2) |
| Both leaderboard modules are needed | `challenges/leaderboard.js` = real RPC (`main.js:65`); `leaderboard.js` = fake cohort, only `results.js:3` | only the RPC one |

## Bugs

1. **Weekly leaderboards skip the window, course and distance checks.** Symptom: a run
   uploaded weeks later, a run started from a Challenges tab left open past Monday
   00:00 UTC (the click handler `ui/challenges.js:196-203` doesn't re-check `isOpen`),
   or a hand-made upload of a 300 m run tagged `…-10k`, all rank on the board. Cause:
   `score_plausibility.sql:85` applies those checks only when a `challenges` row exists,
   and no weekly row is ever created. The client doesn't check the window either
   (`entries.js:9-16`). Verified by reading; pgTAP `03:85-89` asserts "a challenge
   without a row counts every run tagged with it". Not run against Postgres. **Medium.**
2. **Every results page shows a fake leaderboard.** Symptom: after a real run, even a
   challenge run, you see "Kite", "Moss"… instead of your real rank. A run is first
   exactly when it scores ≥ 291 (top of the cohort, ties go to your run,
   `leaderboard.js:7-12,27-32`). A correct answer is worth 50-100 within 60 s and 0
   after (`scoring.js:3-7`), so a 3K needs near-instant answers to win, while a 5K with
   5 correct answers (250-500) wins unless answered slowly. Cause: `results.js:127`.
   Verified by reading. `history-and-progress.md` bug 3 repeats the "every 5K/10K ranks
   #1" claim; this memo owns the fix. **Low.**
3. **Challenge dates are a day off outside UTC.** Symptom: in Los Angeles 2026-W44 shows
   "25 Oct 2026 – 1 Nov 2026" (Sun–Sun); in Tokyo "26 Oct 2026 – 2 Nov 2026" (Mon–Mon).
   Cause: UTC instants formatted in local time (`ui/challenges.js:125,131`,
   `runFormat.js:7-10`). Reproduced with `TZ=… node` on `challengeDetailMarkup`. **Low.**
4. **"Sign in to compare" appears when the board fails to load.** `null` means "no
   board" in two places: `loadChallengeLeaderboard` returns it when there is no client
   (`challenges/leaderboard.js:7-9`; local-only build, or the Supabase SDK failed to
   load, `supabase.js:36-54`, `auth/session.js:143`), and the `.catch(() => null)` at
   `ui/challenges.js:189` turns every RPC error into it. Production is configured
   (`web/.env.production`), so a client exists even signed out, yet a signed-in runner
   who is offline is told to sign in (`:44-45`). Verified by reading. **Low.**
5. **Impossible week ids alias real weeks.** `parseChallengeId` (`schedule.js:27`)
   accepts W00, W54-W99 and W53 in 52-week years. Reproduced: `#/challenges/2025-W96-3k`
   is open now (starts 2026-10-26, same as 2026-W44), has a different question set and
   its own leaderboard. Only by typing the URL. **Low.**
6. **A challenge run with any questions ranks.** `run_is_plausible` checks pace, answer
   count and summed points only (`score_plausibility.sql:44-56`), and
   `challenge_leaderboard` adds nothing on `question_id` (`:78-92`), so an upload tagged
   with a challenge id but other questions (say, the easiest ones) ranks. Part of the
   known "scores come from the client" limit. Verified by reading. **Low.** needs
   answer: Q6.

## Proposal

1. **Server derives weekly windows from the id** (fixes 1). New migration
   `…_weekly_challenges.sql` (timestamp: Q5): drop `challenges` (Q1), replace
   `challenge_leaderboard` so an id must match `^\d{4}-W\d{2}-(3k|5k|10k)$` and
   round-trip through `to_char(monday, 'IYYY-"W"IW')`; Monday is computed like
   `schedule.js:19-23`; the run must start (Q2) inside the week, be uploaded within a
   day of its end, be on that course and cover it. Other ids return no rows. Rewrite
   pgTAP 03/05 accordingly (late, wrong course, short, W99 alias). Fix SUPABASE.md:26,
   29 ("finished within the challenge window", Q2), 34-38, 152-158. needs answer: Q1, Q2.
2. **Client uses the same rule** (fixes 1, 5): `isCountedEntry` adds the window check
   on `startedAt` (Q2); `parseChallengeId` rejects ids whose `weekKey(isoWeek(weekStart()))`
   differs. One test each in `challenges.test.mjs` / `challenge-schedule.test.mjs`
   (dates). needs answer: Q2.
3. **Delete the synthetic leaderboard** (fixes 2): see "What to delete". For a run with
   a `challengeId`, the results footer links to `routeHref('challenges', id)`.
   needs answer: Q3.
4. **Show challenge dates in UTC** (fixes 3): `formatDate` passes a `timeZone` option
   to `toLocaleDateString`; the detail page uses `'UTC'` and says "UTC". needs answer: Q4.
5. **Honest leaderboard error** (fixes 4): the `.catch` renders "Leaderboard
   unavailable" instead of `null`; it catches every RPC error, not only offline
   (`challenges/leaderboard.js:10-14`). No answer needed.
6. **Small deletions:** the always-null `theme` (`schedule.js:41,52`), the unused `limit`
   option (`challenges/leaderboard.js:6`, inline 50), and `challengeCard` building a
   whole question set to count it (`ui/challenges.js:63` → `questionCountOf`). No answer
   needed.
7. **One ISO-week key**: `progress.js:39-44` `isoWeekKey(start)` →
   `weekKey(isoWeek(new Date(start)))` from `schedule.js`; `isoWeek` needs a `Date`
   (`schedule.js:6-7`), production passes ms (`progress.js:140-145`) and the tests pass
   strings (`progress.test.mjs:62-66`). Drop `progress.test.mjs:63-66`, which duplicate
   `challenge-schedule.test.mjs:15-18`; keep the W02 case (`:62`) as an `isoWeek` test.
   Coordinate with the history memo. No answer needed.
8. **Challenge question ids** (fixes 6): `challenge_leaderboard` would need the expected
   set, which only the client computes (`select.js`). Either upload-time check against a
   server copy of the set, or accept the limit and say so in SUPABASE.md. needs answer: Q6.

Not doing: moving `isoWeek`/`weekStart` into `question-server/select.js` to merge with
`challengeWeekIndex` (`select.js:87-97`). The server can't import web code, and the
formula is three lines.

## What to delete

- `web/src/leaderboard.js` and `web/test/leaderboard.test.mjs`: `git grep leaderboard.js`
  finds only `results.js:3`, the test and the separate `challenges/leaderboard.js`.
  With it: the `leaderboard` option (`results.js:36,42,99,127`), CSS `.breakdown tr.you`,
  `tr.synthetic-row`, `.tag.synthetic`, `.card.synthetic`, `.synthetic-caption`
  (`style.css:449-491`; class `you` is only emitted by `leaderboard.js:44`; "synthetic"
  appears nowhere else in `web/src` or `e2e`), and the assertion at `history-ui.test.mjs:144`.
  `docs/MVP-PLAN.md:78` is the prototype's status table, left as history.
- `public.challenges` table, its 4 policies and grants (`accounts_runs.sql:267-307`), if
  Q1 is yes: `git grep -E "from\('challenges'\)|into public\.challenges"` finds only
  pgTAP 03/05 and SUPABASE.md:156; `schedule.js` builds challenges itself.
- `theme`: `git grep -E "\.theme\b|theme:"` finds only `schedule.js:52`.
- `limit` option: the only callers are `main.js:65` and `challenge-leaderboard.test.mjs`,
  neither passes it.
- `isoWeekKey`: used only at `progress.js:145` and `progress.test.mjs:62-66`.

## Questions

1. **Drop the `challenges` table until the admin page exists?** **Default: yes.**
   Nothing reads or writes it, and it is the reason bug 1 exists. The admin page can add
   the table it actually needs.
2. **Does a challenge run count by start or by finish time?** **Default: start.** A 10K
   begun Sunday 16:30 in Los Angeles ends after Monday 00:00 UTC, and the app let you
   start it.
3. **Remove the synthetic leaderboard from the results page (link to the real board on
   challenge runs)?** **Default: yes.** It shows made-up people after real runs and
   ranks every distance against one cohort.
4. **Show the week in UTC, or the end time in local time ("ends Sun 17:00")?**
   **Default: UTC.** It is one option on `formatDate`; local end times need more wording.
5. **Timestamp for new migrations.** The rule is today's date (2026-10-31), but the
   last two local migrations are already dated `20261101…`. Whether they are applied
   remotely is not in the repo; check the Supabase migration history. If they are, an
   earlier timestamp would sort before applied ones, and `supabase db push` refuses that.
   **Default: `20261101000200`**, the next local slot after the last migration.
6. **Check challenge question ids on the server, or document the limit?**
   **Default: document it.** A server check needs a server copy of the bank and the
   selection (`select.js`), a larger change than the other fixes.
