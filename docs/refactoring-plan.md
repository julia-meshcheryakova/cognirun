# Refactoring plan

Aim: code that is easier to understand and change, less of it, and real bugs fixed
on the way, with no new architecture. Rounds: 0 audit, 1 mechanical clean-up,
2 one memo per user-facing area, 3 implement the memos, 4 strict types. The audit
is re-run after each round.

## At a glance

- **Size:** about 6k lines of hand-written JS across a vanilla Vite app (55
  modules), a Node question server, Vercel `api/`, Cloudflare `functions/`,
  `serve-app.mjs` (Render) and Supabase SQL. Lint 0, no import cycles, 0.4% exact
  duplication (mostly the API copies, step 3.3).
- **One check command:** `npm run check` = lint, typecheck, unit tests, build, e2e
  (`--fast` = lint, typecheck, unit; `--db` adds pgTAP). The pre-push hook runs it.
- **Where the debt really is:**
  1. **The API is written four times** (`question-server/server.mjs`,
     `serve-app.mjs`, `api/*.mjs`, `functions/`). Only Vercel is live: Render was
     never deployed (404) and Cloudflare was never cut over.
  2. **The run start/exit flow in `main.js`** has a real bug: exiting while the
     questions load still starts the run in the background.
  3. **Flexibility nobody uses:** server-side filters and `subscribe` on the remote
     run store (production never calls them), `run.js` owning its own devices
     (tests only), dead exports.
  4. **Docs that drifted:** wrong CI and JDK facts, an MVP "missing" table that is
     now mostly done, and a README intro from the 3-question era.
  5. **Ownership and delete rules in sync** (found in Round 2): runs carry no
     owner, so a signed-out user's runs upload into the next account, and
     "Delete all runs" deletes the account copies while saying "this device".
  6. **The answer loop in `ui/question.js`:** no cancel, the mic restarts in a loop
     after the deadline, and typed text loses to the mic.
- **Not the debt:** file size (`style.css` 1143 lines, `generate/logic.js` 403) and
  the `innerHTML` templates. Neither is causing bugs.

## What's done

| Step | What | Commit |
| --- | --- | --- |
| — | New app icon from a clean vector trace of the logo (not a refactor step; done in between) | [b0202a9](https://github.com/julia-meshcheryakova/cognirun/commit/b0202a9) |
| 0.1 | Audit, this plan, `npm run typecheck` (checkJs, 98 → 0 errors) in the gate, wrong docs fixed | [c5988d1](https://github.com/julia-meshcheryakova/cognirun/commit/c5988d1) |
| 1.1 | Dropped `export` from 20 file-internal names (and the `ROTATION` re-export); deleted the dead `sttAvailable`; deleted `build:web` (identical to `build`, callers moved) | [ed65f89](https://github.com/julia-meshcheryakova/cognirun/commit/ed65f89) |
| 1.2 | Remote store is a plain adapter for syncedStore: `list()` takes no filter (server-side filters were never used), no `subscribe`; `filterRuns` lost its test-only `challengeId` filter; fake Supabase lost `is()` | [7671f9e](https://github.com/julia-meshcheryakova/cognirun/commit/7671f9e) |
| 1.3 | `e2e/helpers.mjs` (`stubSpeech`, `answerQuestions`) replaces the stubs and answer loop copied in the demo-run and challenges specs | [ed9b5ab](https://github.com/julia-meshcheryakova/cognirun/commit/ed9b5ab) |
| 1.5 | Re-audit after Round 1 (see the collapsed section); no new work found beyond the existing plan | [6a2bacd](https://github.com/julia-meshcheryakova/cognirun/commit/6a2bacd) |
| 2.1 | [Run flow memo](memos/run-flow.md): a new bug (exit during a question leaves the mic and voice on), the real cause of the challenge fallback, and `run.js`'s test-only device path | [ee2e208](https://github.com/julia-meshcheryakova/cognirun/commit/ee2e208) |
| 2.2–2.8 | Six more memos, each fact-checked by a second agent (about 60 corrections applied): [answering](memos/answering.md), [history and progress](memos/history-and-progress.md), [challenges and leaderboard](memos/challenges-and-leaderboard.md), [account and sync](memos/account-and-sync.md), [settings, legal and nav](memos/settings-legal-and-nav.md), [API and hosting](memos/api-and-hosting.md), [Android and sensors](memos/android-and-sensors.md). 39 new bugs, see the collapsed list. One commit, not seven: docs only | this commit |
| 2.9 | Round 2 re-plan: Round 3 steps below, no-answer steps first; memo questions merged into "Waiting on you" | this commit |

## What's next

| Step | What | Needs you? |
| --- | --- | --- |
| 3.1 | Exit while loading starts a hidden run; `askQuestion` returns `close()` so exit stops mic, voice and a late judge ([run flow](memos/run-flow.md) 1, 2; [answering](memos/answering.md) P6) | No |
| 3.2 | Demo run detaches the watch; `onPosition?.` (run flow 4, Android B6) | No |
| 3.3 | Android: cancelling the watch picker no longer kills GPS (Android B1) | No |
| 3.4 | Answer loop: typed text wins over the mic, no mic restart after the deadline, cancelled TTS stays silent (answering P1, P2, P5) | No |
| 3.5 | Sync: one pass (fixes the tab hang), upload on `online`, delete in the account first, profile-load error (account P1, P5–P7; history P1) | No |
| 3.6 | Late renders in Settings and Challenges are no-ops; download link on every tab; results "New run" route (settings P2, P4, P5) | No |
| 3.7 | Charts: latitude-corrected route, "5:60" pace labels; History re-renders only when runs change (history P2, P4, P8) | No |
| 3.8 | Challenges: "Leaderboard unavailable" error, one ISO-week key, small deletions (challenges P5–P7) | No |
| 3.9 | Android GPS: 1 s interval, honest denied / location-off states, `bluetooth_le required="false"` (Android P4, P5, P9). Code only; a device check needs an APK build (Actions minutes, so I will ask) | No |
| 3.10 | Delete test-only code: `run.js` own devices, STT test hooks, `real.js` helpers, `calibration.js`, `LEGAL_PAGES`, `filterRuns`, unused options (run flow, answering P8, Android P10, settings P7, history P5, P6) | No |
| 3.11 | Doc fixes listed in the memos | No |
| 1.4 | Delete Render (`serve-app.mjs`, `render.yaml`, `npm start`, its origin and docs) | Yes, Q1 |
| 3.12 | One fetch-style API handler shared by every host ([API memo](memos/api-and-hosting.md) P2–P5) | Yes, Q2 |
| 3.13 | "Delete all runs" deletes this device only | Yes, Q7 |
| 3.14 | Runs carry an owner; only the signed-in owner's runs upload; sign-out is device-only | Yes, Q8, Q9 |
| 3.15 | Challenge window/course/distance rule on server and client, drop the `challenges` table, delete the synthetic leaderboard (migration) | Yes, Q5, Q10, Q11 |
| 3.16 | Scoring and grading: rescued hands-free answers score 50, tapped options graded locally, no `reason` strings | Yes, Q12 |
| 3.17 | Privacy text, GPS stop at run end, error-log purge, speech fallback | Yes, memo questions |
| 3.18 | Android watch disconnect, jitter filter, Start connects GPS | Yes, memo questions |
| 4.x | Strict types one flag at a time (`strictNullChecks`, then `noImplicitAny`, then the rest); then type-check tests and e2e | No |

## Waiting on you

1. **Render was never deployed (404). Delete `serve-app.mjs`, `render.yaml` and its
   docs?** Default: **yes**. The MVP plan already says to retire it, and it is a
   full fourth copy of the API.
2. **Cloudflare Pages: keep `functions/` until you decide to move, or drop it and
   stay on Vercel?** Default: **keep both**, but make both thin adapters over one
   shared handler (3.3), so keeping Cloudflare costs about 20 lines.
3. **Consolidate the 4 Supabase migrations into one?** Default: **no**. They are
   already applied live and are not hard to read.
4. **Trim the stale parts of `docs/MVP-PLAN.md`?** What would go: the §1 "What is
   missing for an MVP" table (12 rows, most now done) and items 1 and 6 of
   "Next, in order" (done or not needed). They would be replaced by one line
   pointing at "Production readiness — status". I would also correct the T2 row
   (85 pgTAP tests, project exists). Default: **yes, exactly that and nothing else**.
5. **New migration timestamps.** Your rule is today's date (2026-10-31), but
   `20261101000000` and `20261101000100` already exist, so a 2026-10-31 file would
   sort before them. Default: **continue the sequence (`20261101000200`, …)**.
6. **Production has no `GROQ_API_KEY` or `ELEVENLABS_API_KEY`** (`/health`), so
   voice transcription and the AI judge are off. Set both on Vercel production
   (and rotate the Groq key that leaked in v1.1.0)? Default: **yes, you set them**.
   I won't touch secrets.
7. **"Delete all runs" in Settings: this device only?** Today it also deletes the
   account copies while the dialog says "this device". Default: **device only**.
8. **Which runs upload?** Default: **only runs stamped with the signed-in user**.
   Runs made while signed out stay on the device and never upload automatically.
9. **Sign out on this device only** (`scope: 'local'`)? Today it signs out every
   device. Default: **yes**.
10. **Delete the fake leaderboard on the results page** (link challenge runs to the
    real board)? Default: **yes**.
11. **Challenges:** count a run by its **start** time, and drop the never-used
    `challenges` table until an admin page exists? Default: **yes, both**.
12. **A correct hands-free answer rescued at the 60 s deadline:** 50 points (the
    floor) or 0 (today)? Default: **50**.

The memos hold about 25 smaller questions, each with a default (answering Q2–Q4,
history Q1–Q5, challenges Q4 and Q6, account Q4–Q6, settings Q2–Q8, API Q3–Q6,
Android Q1–Q6). Silence means the default.

## Not doing, and why

- **React/TypeScript port** (MVP-PLAN §5 proposes it). That is a new
  architecture. Types come from JSDoc plus `checkJs` instead, with no rewrite.
- **Converting `.js` to `.ts`.** Same reason. `tsc` checks the JS as it is.
- **Splitting big files.** Size alone causes no bugs here.
- **Removing the Capacitor plugins and `@fontsource/jetbrains-mono`** that knip
  reports as unused. False positives: Gradle links the plugins
  (`android/capacitor.settings.gradle`) and CSS imports the font
  (`web/src/style.css:8`).
- **A service worker (offline website) or an Android foreground service**
  (settings Q8, Android Q5). Both are new architecture; the docs will say what
  works offline and that the app must stay open.
- **Durable rate limiting, server-side grading.** These are features, not
  refactors. They stay on the MVP plan.

<details>
<summary>Round 0 audit (2026-10-31)</summary>

| Check | Tool | Result |
| --- | --- | --- |
| Lint | `npm run lint` | 0 problems |
| Import cycles | `npx madge@8 --circular` | none (`web/src` 55 files; servers, `api`, `functions`) |
| Duplication | `npx jscpd@4 --min-lines 6 --min-tokens 60` | 11 clones, 134 lines (0.91%): the API handlers (`api/{stt,tts,judge}.mjs`, `functions/api/*`, `question-server/server.mjs`), the e2e stubs (`e2e/challenges.spec.mjs` and `demo-run.spec.mjs`, three clones), and two tests |
| Dead code | `npx knip@5` | 5 "unused" deps (all false positives, see above); 22 unused exports: 20 used only inside their own file, plus `sttAvailable` (`web/src/stt.js:120`, never called) and `corsHeaders`/`llmVerdict` (internal only) |
| Types | `tsc --checkJs` | non-strict: 98 errors in source (fixed in 0.1), 46 more in tests and e2e (not yet checked). `strict`: 846 in `web/src` alone (Round 4 baseline) |
| Largest files | `wc -l` | `style.css` 1143, `generate/logic.js` 403, `library.generated.js` 387, `heartRate.js` 336, `session.js` 316, `stt.js` 274 |
| Live hosts | `curl /health` | Vercel 200; `cognirun.pages.dev` does not resolve; `cognirun-app.onrender.com` 404 |

</details>

<details>
<summary>Round 1 re-audit (2026-10-31)</summary>

| Check | Result | Change since Round 0 |
| --- | --- | --- |
| Lint, typecheck | 0 problems, 0 errors | typecheck is new (0.1) |
| Import cycles (madge) | none | same |
| Duplication (jscpd, same settings) | 6 clones: 5 in the API handlers (`api/{stt,judge}.mjs`, `functions/api/{stt,judge}.js`, `question-server/server.mjs`), 1 in `web/test/history-ui.test.mjs` | 11 clones/134 lines → 6/55 (0.4%); the e2e copies are gone (1.3). The API clones go with 3.3; the test clone is left (setup code, not worth a helper) |
| Dead code (knip) | only the 5 false-positive deps; 0 unused exports | 22 unused exports → 0 (1.1, 1.2) |
| Strict types | 674 errors in `web/src`, 918 across the whole typecheck scope | 846 → 674 in `web/src` (typing in 0.1) |

Re-plan: nothing new. Round 1 is finished except 1.4, which waits on Q1. Round 2 memos are next.

</details>

<details>
<summary>Existing docs checked against the code</summary>

| Doc and claim | Verdict |
| --- | --- |
| `android/README.md`: CI builds on every push/PR, artifact `cognirun-debug-apk` | **Wrong.** `v*` tags or manual runs, artifact `cognirun-apk`, attached to the release. Fixed in 0.1 |
| `android/README.md`: needs JDK 17; plugins are geolocation and bluetooth-le | **Wrong.** CI uses JDK 21; `@capacitor/app` and `@capacitor/browser` are also used. Fixed in 0.1 |
| `scripts/gate.mjs` header: `--fast` "is what the pre-push hook runs" | **Wrong.** `.husky/pre-push` runs the full `npm run check`. Fixed in 0.1 |
| README: "the API surfaces must stay in sync" | **Confirmed.** Four copies, see the duplication row |
| README intro: run 3 km, trivia at km 1, logic at km 2, maths at km 3 | **Stale.** 3K/5K/10K and test courses; solo questions are drawn at random (`selectSoloQuestions`). Fixed in 0.1 |
| README: "Demo mode never touches Bluetooth … the two paths never mix" | **Wrong.** A watch connected on setup feeds demo runs (`run.js`, `devices.attach`). Fixed in 0.1 |
| README: Bluetooth pairing is triggered by "Start run" | **Stale.** The watch and GPS are connected on the setup screen. Fixed in 0.1 |
| README: Render deploy, env on Render | **Stale.** Render was never deployed (Q1) |
| MVP-PLAN §0 T2: "50 pgTAP tests", "the owner still has to create the project" | **Stale.** 85 planned tests; project `rbnnlbhlvtcthyqnuioq` is live (Q4) |
| MVP-PLAN §0 "Next, in order": item 1 owner setup, item 6 Supabase env in `android-build.yml` | **Stale.** Item 1 is done; item 6 is not needed because `web/.env.production` is committed (Q4) |
| MVP-PLAN §1 "What is missing for an MVP" table | **Stale.** Accounts, runs, questions, challenges, navigation, API guard and harness are done. Friends, badges and admin are still missing (Q4) |
| MVP-PLAN §1: "104 web tests and 8 question-server tests" | **Stale** (historical count) |
| MVP-PLAN §5: retire `serve-app.mjs`/Render once Vercel is the only host | **Confirmed**, and Vercel already is (Q1) |
| MVP-PLAN §5: port to React/TS | **Confirmed as a plan; rejected for this refactor** (see Not doing) |
| MVP-PLAN "Production readiness": the guard is on all four API surfaces | **Confirmed.** All four import `apiGuard.js` |
| MVP-PLAN "Production readiness": branded icon still missing | **Confirmed** |
| MVP-PLAN §8: `/questions` 404s under `vite preview` and falls back | **Confirmed** (`config.js` uses `''` in production; `loadLibrary` falls back) |
| QUESTIONS-SPEC: the app falls back to the bundled library | **Confirmed** (`web/src/questions.js` `loadLibrary`) |
| QUESTIONS-SPEC §8: Phase 1 "one per category at km 1/2/3" | **Stale** (historical phase list, left as history) |
| SUPABASE.md: add the Render URL to the redirect allow list | **Stale** if Q1 is yes |

</details>

<details>
<summary>Bugs found so far</summary>

1. **Exit while loading starts a hidden run** (`web/src/main.js`, `startRun`).
   `onExit` stops the run and shows another page, but `startRun` then finishes
   `await loadLibrary()` (up to 2 s) and `store.list()` (up to 3 s while auth
   settles) and calls `run.start()` anyway. A hidden demo run reads questions aloud and
   can later save a record and take over the screen with results. Step 3.1.
2. **A demo run never detaches the watch** (`web/src/run.js`). Demo runs call
   `devices.attach(...)` but `stop()` never calls `devices.detach()`, so a
   connected watch keeps updating the finished run's detached screen. Step 3.2.
3. **Challenge fallback can repeat a question** (`main.js`): when challenge ids
   are missing from the library, gaps are filled from `selectRunQuestions` by
   index, which can pick a question already in the set. See the [run flow memo](memos/run-flow.md)
   for the real cause.
4. **Exit during a question leaves the mic and voice on** (`ui/question.js`):
   `askQuestion` has no cancel, so after exit the question is still read aloud and
   the mic opens and stays open. Step 3.1.

Round 2 memos found 39 more, each with cause and evidence in its memo. The
ones above Low:

- **High:** the mic loops after a silent deadline; typed text loses to the mic
  (answering 1, 2). "Delete all runs" deletes the account copies (settings 1,
  same as account 4 and history 6). Cancelling the watch picker kills GPS on
  Android (Android 1).
- **Medium:** a signed-out user's runs upload into the next account, also mid-upload
  (account 1, 2); the sync loop can hang the tab (account 3); a synced delete comes
  back (history 1, account 7); weekly leaderboards skip the window, course and
  distance checks (challenges 1); a hands-free correct answer scores 0
  (answering 3); ElevenLabs recording stops at 12 s (answering 4); a late Settings
  or Challenges render covers the live run (settings 2); GPS stays on after the run
  and error logs can outlive 30 days, against the privacy text (settings 3, 4); the
  rate limit trusts a client IP header on the Node hosts (API 2); Android manual
  scan throws, a dropped watch goes unnoticed, GPS is requested every 20 s and a
  denied permission shows "No GPS signal" (Android 2–5).

Typing to 0 errors found no further bugs. Two dead arguments (`setMicState`
was passed a status message nothing displays since `4c6addd`) were removed, and
`serve-app.mjs` now parses `PORT` as a number.

</details>
