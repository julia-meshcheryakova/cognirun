# History and progress memo

## Today's behaviour

- When a run reaches its full distance with every question answered (`run.js:192`), `main.js:173-175` builds a `RunRecord` (`toRunRecord`), saves it fire-and-forget, then shows the results page. A failed save is only logged (`main.js:174` `console.warn`); the local `setItem` can throw, e.g. when storage is full (`store.js:69`).
- The results page (`ui/results.js`) shows total points, distance, time and pace, heart rate if any, a table of questions, a "cognitive profile" (percentiles from stub numbers in `percentile.js`), a **synthetic leaderboard**, and route and pace charts. A "New PB!" strip appears once the earlier runs have loaded (`main.js:241-242`).
- History (`#/history`) lists every saved run, newest first: local runs merged with account runs when signed in (`syncedStore.js:208-214`). Each run shows a demo badge, a challenge badge and a 🏆 PB badge where they apply.
- Course chips and a "Show demo runs" toggle filter the list. The course chip also filters the progress overview. The demo toggle only filters the list: progress always leaves demo runs out (`history.js:65` vs `:69`). Filter state lasts for the session (`history.js:16`).
- Progress overview: totals, weekly streak (UTC ISO weeks), a personal-bests table per course (points, fastest time, accuracy, each linked to its run), category accuracy bars, a 6-week accuracy grid, and points and pace sparklines over the last 10 runs.
- Run detail (`#/history/<id>`) uses the same report renderer, plus the PBs this run still holds and a two-step "Delete run".
- History re-renders whenever the store notifies (`history.js:139-142`).
- Settings → "Export my data (JSON)" downloads the account and the merged run list (`settings.js:59-67`): at most 500 local runs (`store.js:23,68`) plus at most 1000 account runs (`remoteStore.js:10,120`).

## Facts checked against code

| Claim | Evidence (file:line) | Verdict |
| --- | --- | --- |
| README: results show a score breakdown, a percentile per category, the GPS route and the pace profile | `ui/results.js:75-111` | confirmed |
| MVP-PLAN:23 "Demo runs are saved but flagged and left out of progress **by default**" | `countedRuns`, `newPersonalBests`, `bestsHeldBy` and `progressSummary` default `includeDemo` to false (`progress.js:27,200,223,249`). No UI passes `true`: the user has no way to include demo runs in progress | confirmed (but the UI offers no override) |
| MVP-PLAN:26-27 "Every finished run is saved on the device" | `main.js:174` saves fire-and-forget and only logs a failure; `store.js:69` `setItem` can throw. No retry, nothing shown | mostly (save failures are silent) |
| MVP-PLAN:374 export = "the account plus all runs" | `dataExport.js:6-24`, `settings.js:60` exports the merged list: local keeps 500 (`store.js:23,68`), the account list is capped at 1000 (`remoteStore.js:10,120`) | too broad (capped lists) |
| QUESTIONS-SPEC:219 category score is "one question per category today, so simply that question's points" | A 5K or 10K asks 5 or 10 questions (`config.js:9-11` totals, `questionCountOf` at `:17-20`), so a category gets several. `percentile.js:35` averages them | stale |
| QUESTIONS-SPEC §7: unasked categories show "not asked this run"; percentile is clamped to 1–99 | `results.js:92`, `percentile.js:28` | confirmed |
| `progress.js:9-10`: weeks are UTC ISO weeks that match the challenge ids | Node probe: `isoWeekKey`/`weekStart` matched `schedule.js` `isoWeek`/`weekStart` every 6 h from 1999-12 to 2040 (0 mismatches). 2020-12-31 and 2027-01-03 give W53. Merging the two: see challenges memo (proposal 7) | confirmed |
| Streak survives an unfinished week and crosses W53 → W01 | `progress.js:181-188`; probe: W52, W53, W01 gives `current: 3` | confirmed |
| PB ties keep the earlier run | Runs are walked oldest first (`progress.js:87`). Points: strict `>` (`:97`); fastest `<` and accuracy `>` (`:98-104`) | confirmed |
| `leaderboard.js:2-4`: "Demo-only leaderboard … while the app runs in demo mode" | `results.js:127` passes `leaderboard: true` for every run | wrong |
| `runRecord.js:3`: "local now, Supabase later" | `history/remoteStore.js` exists and is live | stale |
| Hint "Fastest time counts only runs that covered the whole course" (`progressOverview.js:50`) | App-generated runs are complete: the UI run finishes only at `distance >= TOTAL_METERS` with every question answered (`run.js:192`), and scrubbing is capped at the total (`run.js:227`). Stored and remote records are not guaranteed: Supabase accepts any non-negative distance and duration (`20261029000000_accounts_runs.sql:113-114`), `remoteStore.js:122` returns rows unvalidated, and tests model partial runs (`progress.test.mjs:91,111-115,219-225`). So `isComplete` (`progress.js:57-60`) is still the only guard | true; still needed |
| Answers can be "ungraded" (`correct: null`) | Unreachable for new UI answers: `judgeAnswer` always returns a boolean (`judge.js:139-158`; `askServer` rejects non-boolean at `:115`). But `run_answers.correct` is nullable (`accounts_runs.sql:209`), `remoteStore.js:54,72` keep null both ways, and `results.js:14` and `progress.js:120` handle it | unreachable from the UI; possible in stored data |
| SUPABASE.md:25 `my_category_stats` view | Created in `supabase/migrations/20261029000000_accounts_runs.sql:249`. No reference in `web/src`, `api/`, `functions/` or `question-server/` | exists, unused |
| The local store keeps 500 runs | `store.js:23,68` (the oldest are dropped silently) | confirmed |

## Bugs

1. **Deleting a synced run does not stick when the account delete fails (medium).** Symptom: the user confirms "Delete this run for good?". Offline or on a server error, the run is back in History as soon as the account list loads. It also stays on every other device. Cause: `syncedStore.js:226-235` removes the local copy, swallows the `remote.remove` error into `status.error` (nothing shows it on History), and `list()` merges the account copy back in. Second trigger: if a run is deleted while `sync()` is uploading it, the upload still lands. `local.get` then returns null (`syncedStore.js:173`), and neither branch removes the remote copy. Verified: a Node probe with a remote whose `remove` throws listed `['a']` before the delete and `['a']` after it, with `error: 'Failed to fetch'`. The race was verified by reading the code only.
2. **History re-renders on every sync status change (low).** Symptom: an open "Delete run" confirmation closes by itself, and the charts redraw several times after sign-in or a save. Cause: `setStatus` → `notify` (`syncedStore.js:68-70`), plus a `notify` for every local write (`:74-76`). `history.js:139-142` re-lists and re-renders on each one. Verified: a probe counted 4 listener calls for one sync of 3 runs, which means 4 re-list attempts (each a `store.list`). A stale attempt aborts after its `store.list()` returns (`history.js:121`), so not all of them reach a full render.
3. **The synthetic leaderboard is shown on every real run (low; shared with challenges memo bug 2, see challenges memo).** Symptom: a run ranks #1 whenever it scores 291 or more, on any course. The cohort tops out at 291 (`leaderboard.js:7`) and ties favour the current run (`leaderboard.js:27-32`). A correct answer is worth 50-100 (`scoring.js:3-7`), so 5K and 10K runs nearly always come first. Its own comment says it is demo-only (`leaderboard.js:2-4`), but `results.js:127` always enables it. Verified by reading the code.
4. **The route map is stretched east–west (low).** Symptom: route shapes are distorted. At 52°N, a square block draws about 1.6× wider than tall. Cause: `charts.js:19-28` uses one scale for degrees of latitude and longitude, without the `cos(lat)` correction. Verified by reading the code.
5. **Pace-axis labels can read "5:60" (low).** Cause: `charts.js:81` rounds the seconds separately from the minutes. Verified: the probe printed `5:60`, `4:60` and `6:60` for 5.995, 4.999 and 6.9917 min/km.
6. *(Cross-area; same bug as settings memo bug 1, see settings memo; fixed there.)* **"Delete all runs" also deletes the account's runs (high).** The confirm text says "every run saved on this device" (`settings.js:70`). But `store.list()` merges the account runs (`syncedStore.js:208-214`), and `store.remove` deletes each one from Supabase and from this device (`:226-231`). Local copies on other devices are not wiped. Verified by reading the code.

Suspicions (not verified): personal streaks and the weekly grid use UTC weeks, while run dates show in local time. A Sydney runner's Monday 07:00 run counts in the previous week (probe: `2026-11-01T20:00Z` is in W44), so they can see "run this week to keep it" right after running. See Q5.

## Proposal

1. Make delete stick (bug 1): `syncedStore.remove` deletes from the account first and throws if that fails. The local copy goes only after the account delete succeeds. The run detail page shows "Could not delete, check your connection" and re-enables the button. In `sync()`, a record deleted mid-upload (`latest` is null) is removed from the account again. **needs answer: Q1**
2. History re-renders only when the set of runs changes (bug 2): the listener re-lists, compares `ids.join()` with the shown list (records never change except `synced`, which History does not show) and returns if equal. That is about 3 lines in `history.js`. **no answer needed**
3. Delete the synthetic leaderboard from the results page (bug 3): see challenges memo proposal 3 and its "What to delete". That memo also replaces it, for runs with a `challengeId`, with a link to the real challenge board (`routeHref('challenges', id)`). **needs answer: Q2**
4. Charts (bugs 4 and 5): scale longitude by `cos(mid-latitude)`, compute the min/max once, and format the pace ticks as `formatClock(value * 60)`. **no answer needed**
5. One run filter: delete `filterRuns` and `RunFilter` from `store.js`. `store.list()` and `syncedStore.list()` take no argument. History uses `countedRuns(runs, { includeDemo: showDemo, course })`. `main.js:241` drops its redundant `{ includeDemo: false }`, because `newPersonalBests` already filters. `main.js:218` becomes `(await store.list()).filter((r) => !r.demo)`, which keeps today's behaviour. Update `history.test.mjs:108-109` and `sync-store.test.mjs:196`. **no answer needed**
6. Drop options and fields nothing reads: the `includeDemo` option of `newPersonalBests`, `bestsHeldBy` and `progressSummary`; `trendLimit` and `weeks` (inline 10 and 6); `best().finishedAt`; `weekly[].start`; `trend[].finishedAt/course/accuracy`; `newPersonalBests` `.label` (the markup uses `PB_LABELS`; update `progress.test.mjs:196-198`, and drop the `includeDemo: true` case at `:209`). **no answer needed**
7. Keep `isComplete`, `COMPLETE_SHARE` and the "whole course" hint. Only app-generated runs are guaranteed complete; stored and remote records are not (see Facts). Deleting the check safely would need a DB check constraint in a new migration (timestamp `>= 20261101000200`, challenges memo Q5) plus local validation, which is more code than it removes. **no answer needed**
8. `renderList` computes `scope` and `progressSummary` once and passes them to `historyMarkup` and `drawProgressCharts`. Today both are computed twice (`history.js:63-65` and `:92-93`). **no answer needed**
9. Fix the stale comments and docs: `runRecord.js:3`, QUESTIONS-SPEC:219, MVP-PLAN:26-27 (a failed save is only logged) and MVP-PLAN:374 (export lists are capped). **no answer needed**
10. Drop the "ungraded answer" (`correct: null`) branches in `categoryStats` (`graded` becomes `answered`), in `verdictLabel` and in `runRecord.js:110`, but only after stored nulls are gone. Either add `NOT NULL` to `run_answers.correct` (new migration, timestamp `>= 20261101000200`, challenges memo Q5; set existing nulls to false first), or normalise on read (`fromRunRow` and `upgradeRunRecord` map null to false). **needs answer: Q4**
11. A migration (timestamp `>= 20261101000200`, challenges memo Q5) that drops `my_category_stats`, its pgTAP checks (`supabase/tests/02_runs_rls.test.sql:61,71`) and the SUPABASE.md:25 row. **needs answer: Q3**

## What to delete

- `filterRuns`/`RunFilter` (`store.js:16-40`, plus the `list({ includeDemo … })` contract line `store.js:7`). Grep `filterRuns|list\(\{` finds only `store.js`, `syncedStore.js:1,214`, `history.js:3,69-70`, `main.js:218,241` and two tests. No caller passes `course` to `list`.
- `includeDemo` on `progressSummary`/`newPersonalBests`/`bestsHeldBy`. Grep `includeDemo` in `web/src`: `progress.js` itself; `main.js:218,241`, `store.js:7,18,38-39` and `history.js:69`, which all belong to `store.list`/`filterRuns` (removed above), not these functions. Tests: `progress.test.mjs:209`.
- `weekly.start`, `trend.finishedAt/course/accuracy`, PB `finishedAt`, `newPersonalBests` `.label`. Grep `\.start\b|t\.accuracy|t\.course|\.finishedAt|\.label\b` in `web/src/ui`: `progressOverview.js` reads only `w.week/runs/categories`, `t.points` and `t.paceSPerKm`, and `pb.runId/value`. Only `progress.test.mjs:148,163,196-198` and `history-ui.test.mjs` (`label:` in input data) use the rest.
- `leaderboard.js` (if Q2 is yes): see challenges memo "What to delete".
- Not deleted: `isComplete`/`COMPLETE_SHARE` (proposal 7).
- `my_category_stats` (if Q3 is yes). Grep: the migration, the pgTAP test and SUPABASE.md only.
- For the account-and-sync memo: `syncedStore.get` and `remoteStore.get`. Grep `store\.get\(|\.get\(id\)` in `web/src`: History uses `list().find`, and nothing else calls `get`, except `local.get` inside `sync()`. Tests only.

## Questions

1. **When the account cannot be reached, should "Delete run" refuse (with a message) instead of deleting only on this device?** **Default:** refuse. Remembering pending deletes is new machinery, and with no live users a clear error is enough.
2. **Delete the synthetic leaderboard from the results page?** Same question as challenges memo Q3; answer it there. **Default:** yes. It is fake data, it ranks 5K and 10K runs wrongly, and real per-challenge leaderboards now exist.
3. **Drop the unused `my_category_stats` view with a new migration (timestamp `>= 20261101000200`)?** **Default:** yes. Nothing reads it, and the app computes category stats on the client.
4. **Treat every answer as graded (drop the `correct: null` paths)? If yes, add `NOT NULL` to `run_answers.correct` with a migration, or normalise null to false on read?** **Default:** yes, normalise on read (no migration; covers local and account records), in the same commit as the answering memo's `scoreForAnswer` clean-up. With no live users, nulls counting as wrong is acceptable.
5. **Keep UTC weeks for personal streaks and the weekly grid?** **Default:** keep. They match the challenge weeks, and switching to local weeks would make one screen disagree with another.
