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
| 2.1 | [Run flow memo](memos/run-flow.md): a new bug (exit during a question leaves the mic and voice on), the real cause of the challenge fallback, and `run.js`'s test-only device path | this commit |

## What's next

| Step | What | Needs you? |
| --- | --- | --- |
| 1.4 | Delete Render (`serve-app.mjs`, `render.yaml`, `npm start`, its origin and docs) | Yes, Q1 |
| 2.x | Memos: answering (question, STT, TTS, judge), history and progress, challenges and leaderboard, account and sync, settings and legal pages, API and hosting, Android and sensors | No (each memo ends with questions) |
| 3.1 | Fix exit-while-loading starting a hidden run, and exit during a question leaving the mic on ([run flow](memos/run-flow.md) 1, 2) | No |
| 3.2 | Fix a demo run never detaching the watch handler (`run.js` `stop`) | No |
| 3.3 | One fetch-style API handler shared by every host, so each host file is a few lines | Yes, Q2 |
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

## Not doing, and why

- **React/TypeScript port** (MVP-PLAN §5 proposes it). That is a new
  architecture. Types come from JSDoc plus `checkJs` instead, with no rewrite.
- **Converting `.js` to `.ts`.** Same reason. `tsc` checks the JS as it is.
- **Splitting big files.** Size alone causes no bugs here.
- **Removing the Capacitor plugins and `@fontsource/jetbrains-mono`** that knip
  reports as unused. False positives: Gradle links the plugins
  (`android/capacitor.settings.gradle`) and CSS imports the font
  (`web/src/style.css:8`).
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

Typing to 0 errors found no further bugs. Two dead arguments (`setMicState`
was passed a status message nothing displays since `4c6addd`) were removed, and
`serve-app.mjs` now parses `PORT` as a number.

</details>
