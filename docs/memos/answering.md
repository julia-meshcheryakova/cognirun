# Answering memo

Scope: one question, from the beep to the verdict card. Files: `web/src/ui/question.js`,
`stt.js`, `tts.js`, `judge.js`, `scoring.js`, `beep.js`, `config.js` (URLs), and the client
contract of `/api/{config,tts,stt,judge}`. Exit and run start/finish belong to the run-flow memo.

## Today's behaviour

- A double beep plays (430 ms), then the prompt is read aloud: ElevenLabs mp3 via `POST /api/tts`, or the browser voice if that fails (`tts.js:63-69`). Voice off skips reading.
- The screen shows the prompt, tap buttons for multiple-choice questions, a mic icon, a "Backup: type instead..." box and a **Submit** button. A timer counts **up** from 0.
- When reading ends, the mic opens by itself (`question.js:44-48`). It uses ElevenLabs recording + `/api/stt` if `/api/config` says `elevenLabs: true`, else the browser recogniser, else (no recogniser: `sttMode()` returns `'recorder'`, `stt.js:114-117`) a recorder that still posts to `/api/stt` (`stt.js:245-265`).
- While the mic is on, **Submit** stops it and transcribes. The answer time is taken at that tap (`question.js:152`).
- Tapping an option submits it at once. Without a mic, Submit sends the typed text.
- At 60 s: if the mic is on, it is stopped and transcribed; otherwise whatever is typed (or the last interim guess) is submitted (`question.js:133-146`).
- Grading: exact match after normalising, then "contains the answer", then `POST /api/judge` (Groq). A 503 or an error counts as wrong (`judge.js:131-157`).
- A correct answer scores 100 → 50 over 60 s. A wrong one scores 0 (`question.js:218`, `scoring.js:4-8`). The card shows ✅/❌, what you said and the answer, and the run resumes at once.
- Production today (`curl /health`, 2026-10-31): `eleven:false, groq:false`. So the live app uses the browser voice, and grading is local only. Clients with a recogniser use it; recorder-only clients (no `SpeechRecognition`) still record, and `/api/stt` returns 503 without the key (`api/stt.mjs:32`), so their spoken answers fail.

## Facts checked against code

| Claim | Evidence (file:line) | Verdict |
| --- | --- | --- |
| README:84, MVP-PLAN:59: 100 → 50 points over 60 s, 0 if wrong | `scoring.js:4-8`, `question.js:218` | confirmed |
| README:57-60: ElevenLabs TTS, browser fallback; switch "on the start screen" | `tts.js:63-69`; switch is on Settings (`ui/settings.js:18`), setup only hints (`ui/setup.js:102`) | confirmed / **stale** (switch location) |
| README:68-69: the mic unlocks when reading *starts*, there is a mic button | mic opens after `await speak` (`question.js:46-48`); the icon is a `<span>` (`:65`) | **wrong** |
| README:70-71: "tap the mic, speak, tap again"; time is taken at the tap | mic opens itself; one Submit tap, `elapsedSeconds` at `question.js:152` | **wrong** (flow) / confirmed (timing) |
| README:72-76: ElevenLabs STT when configured, else Web Speech; `stop()` bounded | `stt.js:248-265`; 6 s race at `question.js:158-163` | confirmed |
| README:77-83: local rules first, then `/api/judge`, which looks the question up by id | `judge.js:139-149`; `llmJudge.js:83` | confirmed |
| README:84-87: the card shows which rule decided (`exact`, `contains`, `no-match`) | card `question.js:233-240` and `ui/results.js:13-24` never show `method`; only stored (`history/runRecord.js:112`) | **wrong** |
| README:88-90: typing works at all times; the mic button is then disabled | typed text is ignored while the mic is on (bug 1); no mic button | **wrong** |
| README:93-95: no `GROQ_API_KEY` → 503 → local only | `llmJudge.js:82`, `judge.js:112,149` | confirmed |
| README:110-111: frozen "until you dismiss the revealed answer" | `onClosed()` runs right after judging, no tap (`question.js:241-244`) | **stale** |
| QUESTIONS-SPEC:42-46: a tap submits the option; exact, contains, then LLM | `question.js:248`; a wrong tapped option also goes to the LLM | confirmed |
| MVP-PLAN:188: `method` can be `'choice'` | methods are `exact/contains/llm/no-match/empty` (`judge.js:127,139-155`) | **wrong** |
| MVP-PLAN:150: `/health` reports `eleven: false` | live `/health`: `eleven:false, groq:false` | confirmed (still true, and Groq is off too) |
| `question.js:18`: graded by "normalized exact match" | also contains + LLM (`judge.js:143-149`) | **stale** |
| `question.js:182`: "retry listening once" | no counter, retries every time (`:169,184`) | **wrong** |
| `stt.js:2-4`: "Browser-native only … no external service" | ElevenLabs path `stt.js:56-107` | **wrong** |
| `stt.js:110-112`: modes are `browser`/`none` | also `recorder` (`stt.js:116`) | **stale** |
| `tts.js:58-62`: `speak()` always resolves once playback ends | `cancelSpeech` pauses without settling (`tts.js:18-23,49-51`) | **wrong** (only leaks) |
| `spoken-answer.test.mjs:52`: "the matching rule the question screen applies" is exact, case-sensitive | the screen uses `judgeAnswer` (`question.js:216`) | **wrong** (test asserts a rule nothing uses) |
| `config.js:47`: "the headless tests never call it" | the default `JUDGE_URL` is `''` without `import.meta.env` (`config.js:49-50`), so Node never hits the deployed judge; but `judge.test.mjs:145-160` exercises the judge with a mock endpoint | confirmed (deployed URL only) |

## Bugs

Repros were throwaway Node scripts in `%TEMP%` (fake slot, stubbed `listen`, `fetch`, `Audio`, `MediaRecorder`), now deleted. Root `npm test` (`package.json:13`: web + question-server) passes 252/252 (web 219, server 33), but nothing tests `question.js`.

1. **Typed answer is ignored while the mic is on.** Symptom: the runner types "Tokyo" and taps Submit. If the mic heard nothing, it restarts and nothing is submitted, on every tap; if it heard anything, that transcript is submitted at once and "Tokyo" is discarded. Cause: Submit calls `toggleMic()` whenever `micState === 'recording'` (`question.js:252-254`), and the mic is always recording after reading. With no transcript and no interim, the mic reopens (`:173-185`). A non-empty transcript is passed as `text` (`:187`), which wins over the box (`:206-207`). Verified: typed "Tokyo" plus 3 taps with a silent mic gave 4 `listen` calls and no answer. **High.** E2E misses it because `stubSpeech` removes the mic (`e2e/helpers.mjs:13-17`). E2E misses it because `stubSpeech` removes the mic (`e2e/helpers.mjs:13-17`).
2. **Silence at the 60 s deadline loops the mic forever.** Symptom: on a free-text question, a runner who said nothing never gets past it, and the mic restarts every ~200 ms. A demo run stays frozen; a real run keeps counting distance and queuing segments behind the stuck question (`run.js:91-120`, run-flow memo). Cause: the deadline calls `toggleMic` (`question.js:140-142`). An empty transcript reopens the mic (`:184`). On the browser path the reopen finishes before the next tick, so the tick calls `toggleMic` again, and `submit` (`:145`) is never reached. Verified: in 4 s after the deadline there were 18 `listen` calls and no answer. **High** (this is the live browser-recogniser path).
3. **A hands-free answer is marked correct but scores 0.** Symptom: you say the answer and don't tap Submit. At 60 s it is transcribed, shown ✅, and earns 0 points. Cause: the deadline rescue runs only once `elapsed >= 60` (`question.js:136`) and records `elapsedSeconds` then (`:152`). `scoreForElapsed` returns 0 for anything `> 60` (`scoring.js:5`). Ticks are 200 ms apart, so elapsed is almost never exactly 60. Verified by reading, and `run-flow.test.mjs:157` asserts `scoreForElapsed(60.5) === 0`. **Medium.**
4. **ElevenLabs recording stops after 12 s, but the screen still says recording, and the mic stays on.** Symptom: an answer spoken after 12 s is lost. Submit transcribes the first 12 s, and the OS mic indicator stays lit until stop/cancel. Cause: the cap timer only calls `recorder.stop()` (`stt.js:68-70`). Track cleanup is in `cleanup()` (`:76-79`), which only `stop()`/`cancel()` call, and the UI is never told. Verified: after 12.5 s, `recorder.stop` had run once and the mic tracks were stopped 0 times. **Medium** (any recorder session: with an ElevenLabs key, and today on recorder-only clients, which record even though `/api/config` says `false`, `stt.js:114-117,245-265`).
5. **Answering before the TTS audio arrives still plays it.** Symptom: you tap an option within about a second, and the question is read out over the verdict (or over the next screen). Cause: `cancelSpeech()` (`tts.js:18-23`) cannot stop a `speakElevenLabs` that is still in `fetch`. Then `new Audio(...).play()` runs (`:40-52`). Verified: `speak()`, then `cancelSpeech()` 50 ms later, still played once. **Low.** It also means run-flow step 1's `close()` can't silence speech alone.
6. **Exit during a question** (run-flow memo bug 2). New evidence: (a) with the clock frozen, `listen`'s session got 0 `stop`/`cancel` calls in 3 s. (b) Exiting while the **last** answer is still being transcribed or judged later calls `onClosed` (`question.js:244`). That runs `noteAnswered` → `maybeFinish` (`main.js:211`, `run.js:233-236,190-196`), and since distance already equals the course length, it saves the run and shows results after exit (`main.js:171-176`). Verified by reading. **Medium.**

Suspicions (not verified):
- The browser recogniser (Android Chrome) may end itself on silence. The UI then still shows recording, and a later answer is unheard. `startListening` hides `ended` (`stt.js:258-262`).
- With Groq on, a wrong *tapped* option is sent to a "lenient" LLM (`llmJudge.js:16`) that could accept it, and it costs up to 6 s with the question open (a demo run frozen; a real run keeps counting).
- `/api/tts` has no client timeout (`tts.js:40-44`), so a hanging server delays the mic until the platform kills the function.

## Proposal

1. Submit with text in the box submits that text and cancels the mic (`question.js:252-255`). Fixes bug 1. No answer needed.
2. After the deadline, never reopen the mic. An empty or failed transcript submits the box, or an empty answer so the judge returns its `empty` verdict (`question.js:166-185`, `judge.js:138-139`). Fix the "once" comment. Fixes bug 2. No answer needed.
3. Clamp a deadline-rescued `elapsedSeconds` to 60, so a correct hands-free answer scores 50. Needs answer: Q1.
4. Delete the 12 s `ELEVENLABS_MAX_MS` cap and set `audioBitsPerSecond: 32000` on the `MediaRecorder` (`stt.js:60-63`; ~240 KB/min). Today no bitrate is set, so 60 s is not guaranteed to fit the 2 MiB limit (`question-server/apiGuard.js:21-24`). With it set, the 60 s deadline (step 2) and run-flow `close()` bound the size. Simplest: one option, no new timer. Fixes bug 4. No answer needed.
5. `tts.js`: `cancelSpeech` bumps a counter. `speakElevenLabs` returns without playing if the counter changed during `fetch`/`blob`, and a cancelled play resolves its promise. The `.catch(() => speakBrowser(text))` fallback (`tts.js:69`) checks the same counter, so a cancelled failure doesn't speak either. Fixes bug 5 and the hanging promise. No answer needed.
6. In run-flow step 1 (`askQuestion` returns `close()`), `close()` also sets a flag. `submit` checks it after `await judge` and then skips `onAnswered`/`onClosed`. Fixes bug 6b. No answer needed.
7. Tapped options are graded by plain equality, with no server call. Needs answer: Q2.
8. Delete the test-only STT code (see below). Port the four index-revision tests from `spoken-answer.test.mjs` to `startListening().stop()`, and delete the `matches` tests. No answer needed.
9. Delete `scoreForAnswer`, the `spoken` field, the `TRANSCRIBE_BOUND_MS` alias and the client `reason` strings. Needs answer: Q3 (reasons only).
10. Docs: fix the README Sound/Voice/Demo lines, MVP-PLAN:188 and the stale comments in the table above. No answer needed.

## What to delete

Search: repo-wide `Select-String` over `*.js,*.mjs,*.md,*.yml,*.yaml,*.json,*.html,*.sql` (excluding `node_modules`, `dist`, `.git`, `.wrangler`), plus `grep` in `web/src`, `e2e`, `api`, `functions`, `question-server/server.mjs`.

- `listenOnce`, `cancelListening`, `listening` (`stt.js:268-311`): only `web/test/spoken-answer.test.mjs` and `web/test/stt.test.mjs:121-128` use them. No use in src, e2e, docs or workflows.
- `startRecognitionSession`'s `continuous` option, the `error` variable, the returned `settled`/`ended`/`error` properties and the collector's `confidence` (`stt.js:142,155,165-167,180,184,193-196,208-214`): only `listenOnce` reads them (`confidence` matches only in `stt.js`). Keep the internal `ended` flag and `settled` promise: `drain()` behind `startListening().stop()` needs them (`stt.js:192-202,215-224`).
- Keep `on()` (`stt.js:120-123`): production uses it for `result`/`end`/`error` (`:188-201`) so recognisers with only `onresult`/`onend`/`onerror` still work.
- `scoreForAnswer` (`scoring.js:10-18`, defined at `:15`): only `web/test/run-flow.test.mjs:5,161-169`.
- `spoken` (`question.js:145,179,187,194,196,228`): not in `toRunRecord` (`runRecord.js:103-113`), and no other reader. The other matches are prose.
- `TRANSCRIBE_BOUND_MS` (`question.js:9,162`): an alias for `STT_TIMEOUT_MS`, with no other users.
- Verdict `reason` (`judge.js:116,122,139-155`): no reader in `web/src` (`grep reason` finds only `judge.js` and an unrelated `logger.js:66`). Tests `judge.test.mjs:49,153,201,211` change. The server keeps its own `reason`.

## Questions

1. **Hands-free answers rescued at 60 s: 50 points (the floor) or 0?** **Default:** 50. Being hands-free is the point of the app, and README:84 promises points for correct answers.
2. **Grade tapped options locally only (no LLM call)?** **Default:** yes. Options are exact strings, so a call can only add delay or a wrong "lenient" yes.
3. **Delete the verdict `reason` strings, or show the rule on the card as README:85-87 says?** **Default:** delete them and the README line. Nothing reads them, and `method` is still saved.
4. **Production has no ElevenLabs or Groq key (`/health`). Set them, or accept browser-only voice and local grading?** Without the key, recorder-only clients still record and get a 503 from `/api/stt` (`stt.js:245-265`, `api/stt.mjs:32`), so "browser-only" also means falling back to typing there (or the client skipping the recorder when `/api/config` says `false`). **Default:** set `ELEVENLABS_API_KEY` before the next APK release. `tts.js:1-4` and `stt.js:54-55` say the WebView's own speech is silent. That's from code comments; I did not test it on a device.
