# Run flow memo

Scope: from tapping **Start run** (setup screen or a challenge) to the results
page, including exit. Files: `web/src/main.js` (`startRun`, `showResults`),
`web/src/run.js`, `web/src/clock.js`, `web/src/sensors/{real,demo}.js`,
`web/src/ui/live.js`. Answering a question has its own memo.

## Today's behaviour

- **Start run** hides the tabs, primes audio and renders the live screen at once.
  Questions load in the background: from `/questions` with a timeout, or the
  bundled library if that fails.
- Solo runs draw random questions and avoid the last 150 asked. Challenge runs
  get fixed question ids from the challenge.
- After loading, the run starts. A real run reads the GPS and watch connected
  on the setup screen. A demo run simulates GPS on a clock sped up by the
  multiplier, and still uses a real watch if one is connected.
- Every segment (1 km; 100 m or 20 m on the test courses) beeps and opens a
  question. In a demo run distance is frozen while the question is open. In a real
  run it keeps counting, because the runner keeps moving, and later segments queue.
- The run finishes when the distance is done **and** every question is answered.
  The record is saved (not awaited) and the results page renders from it, then
  adds "New PB!" once earlier runs load.
- **←** asks "End this run and go back to setup?" and then stops the run. Nothing
  is saved.

## Facts checked against code

| Claim | Evidence | Verdict |
| --- | --- | --- |
| The live screen shows before questions load | `main.js:138` render, then `:217` await | confirmed |
| A run only reads devices connected on setup | `sensors/real.js:17-24` attach only; `main.js:159` always passes `devices` | confirmed |
| `run.js` can own its devices ("a run given none owns the ones it makes") | `run.js:133-136`; `createRun` is called without `devices` only in `web/test/{gps,heart-rate,run-flow}.test.mjs` | confirmed, **test-only** |
| Distance freezes during a question | `clock.js:24-32` freezes only the simulated clock; real fixes keep flowing (`sensors/real.js:18-20` → `run.js:91-125`) and queue in `pendingKilometers` (`main.js:168`, `:188-191`) | confirmed for demo runs; real runs keep counting, by design |
| Finish needs distance **and** all answers | `run.js:190-197` | confirmed |
| Question count = total / segment | `config.js:17-20`, `run.js:75`, `ui/live.js:10` and `:83` (same formula four times) | confirmed |
| Challenge question ids come from the same library they are looked up in | ids from `question-server/select.js:107-125` (default library: bundled `QUESTION_LIBRARY`); lookup in `main.js:220` (server library when it loads) | **wrong**, see bug 3 |
| PB detection is safe while the save is still running | `progress.js:202-204` drops `record.id` | confirmed |

## Bugs

1. **Exit while loading starts a hidden run** (known, step 3.1). `onExit`
   (`main.js:147-152`) stops a run that has not started yet. `startRun` then
   carries on after its awaits (`:217-229`) and calls `run.start()`. In a demo
   run the hidden clock moves on and asks questions out loud into a detached DOM,
   with the mic opening for each. A question with no mic open is answered empty
   at 60 s. With the mic recording, the deadline transcribes or retries instead
   (`ui/question.js:140-145`). So the hidden run can, but does not always,
   save a record and replace the current page with results. In a real run nothing arrives (devices are detached), but the clock
   interval runs forever. `starting` is reset by `onExit`, so a second run can
   start alongside it. Verified by reading the path. **High.**
2. **Exit during a question leaves the mic and voice on.** `askQuestion`
   (`ui/question.js`) has no cancel. Exit stops the run clock, so the answer
   deadline (`question.js:133-146`) never fires. The `voiceTimer` still reads
   the question aloud and opens the mic (`:36-48`). Nothing calls
   `session.cancel()` after that, so the ElevenLabs recorder's stream tracks stay
   live (`stt.js:76-79` only runs from `stop`/`cancel`), and the browser
   recogniser runs in `continuous` mode. The 200 ms interval also never stops.
   A third case: exiting while the async judge runs (`question.js:216-244`)
   still calls `onAnswered`/`onClosed`. On the last question that reaches
   `noteAnswered` → `onFinish`, which saves and shows results after the exit.
   Verified by reading the path. **Medium** (the mic stays on after leaving).
3. **Challenge fallback can repeat a question** (known). The cause is broader
   than "rare": the ids are built from the **bundled** library but resolved in
   whatever `loadLibrary` returned. If the server's bank differs (an Android APK
   that is older than the deploy), ids go missing and `main.js:222-226` fills the
   gaps by index from `selectRunQuestions`. That can repeat a question, and it
   lines categories up by index, not by the challenge's difficulty curve.
   Verified by reading. **Low** today, because web and server deploy together.
4. **A demo run never detaches the watch** (known, step 3.2). `run.js:137-145`
   attaches and `stop()` (`:199-203`) does not detach. The next `attach`
   replaces the handlers (`devices.js:221-222`), so the leak only lasts until
   the next run. **Low.**

## Proposal

1. **Fix 1 and 2 together (3.1).** In `startRun`, return after each await if the
   run was exited (an `exited` flag set in `onExit`). `askQuestion` returns a
   `close()` that clears both timers, cancels speech and the mic session, and
   sets a `closed` flag. Every await in `askQuestion` checks that flag before
   it touches the DOM or calls back, including after `judge`. `onExit` calls it
   for the open question. No answer needed.
2. **Fix 4 (3.2).** `stop()` calls `devices?.detach()` for demo runs. No answer
   needed.
3. **Fix 3 by deleting the fallback.** Challenge runs look up their ids in the
   bundled library they came from, or `buildChallengeQuestionSet` returns
   questions instead of ids. Then the fill-in block (`main.js:222-226`) and the
   `selectRunQuestions` import go. No answer needed (Q1 asks only about
   `/questions`).
4. **`run.js` always gets `devices`.** Delete the `ownDevices` path, the
   `bluetooth`/`geolocation`/`onError` options, the returned `sensors` and `now`,
   and `RUN_DISTANCE_METERS`/`QUESTION_COUNT` (tests use `courseOf('3k')`). Every
   real-run `createRun` in `gps`, `heart-rate` and `run-flow` tests builds
   devices with `createDevices` and passes them in. The `heart-rate.test.mjs:233`
   assertion on `run.sensors` goes. `run-flow.test.mjs:55-57` switches to
   `run.answerNow()`: today it reads the frozen simulated clock, so its timing
   check proves nothing. That is about 25 lines less in `run.js`. No answer needed.
5. **Small `main.js` tidy-ups,** in the same commit as 4: compute points once
   (the reduce is copied at `:163` and `:201`), drop the redundant
   `starting = false` in `showResults`, and move the stray `import` (`:31`) up
   with the others. No answer needed.

## What to delete

- `run.js` `ownDevices`, and the `createDevices` import in it. `rg "createRun\("`
  finds only `main.js:155` outside tests, and that call passes `devices`.
- `RUN_DISTANCE_METERS`, `QUESTION_COUNT`: used only in `web/test/{gps,run-flow}.test.mjs`.
- `run.sensors`, `run.now`: used only in `web/test/{gps,heart-rate,run-flow}.test.mjs`.
- `selectRunQuestions` (after step 3): used only in `main.js:224` and tests.
  Its own cases in `questions.test` and `history.test.mjs:46-55` go.
  `spoken-answer.test.mjs:205` only uses it to get fixtures, so it switches to
  explicit questions and stays. `docs/QUESTIONS-SPEC.md:160` ("stays") and the
  `docs/MVP-PLAN.md` mentions get updated in the same commit.

## Questions

1. **Keep fetching `/questions` from the server, or always use the bundled
   library?** Default: **keep**. It lets the APK get new questions without a
   release, and once step 3 is done it no longer affects challenges.
2. **Exit asks "End this run and go back to setup?" and discards the run. Should
   an exited real run be saved as incomplete?** Default: **no, discard**. The
   History "complete" logic already handles partial runs, but saving them is a
   product change. Not part of this refactor.
