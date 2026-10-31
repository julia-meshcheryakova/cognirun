# CogniRun

Run 3 km; after every completed kilometer the app beeps and asks a question — one
per cognitive dimension: trivia at km 1, logic at km 2, maths at km 3. Answering
faster scores more points (100 points instantly → 50 points at 60 seconds). After
3 km and 3 questions you get a results page with the score breakdown, a
population-relative percentile per category, the GPS route and the pace profile.

- `web/` — the browser app (all functionality lives here)
- `question-server/` — the questions library, the LLM answer judge and the local dev API
- `api/` — the same API as Vercel serverless functions (production)
- `functions/` — the same API as Cloudflare Pages Functions ([docs/CLOUDFLARE.md](docs/CLOUDFLARE.md))
- `serve-app.mjs` — the same API plus the built app as one Node server (Render)
- `android/` — Capacitor wrapper that ships the web app as an APK
- `e2e/` — Playwright smoke tests against the production build
- `scripts/` — the local ship gate and the post-deploy smoke check
- `docs/QUESTIONS-SPEC.md` — categories, library, selection and percentile framing
- `docs/MVP-PLAN.md` — the roadmap from demo to MVP

The API surfaces (`question-server/server.mjs`, `api/*.mjs`, `functions/`,
`serve-app.mjs`) must stay in sync: `/health`, `/questions`, `/api/config`, `/api/tts`, `/api/stt`,
`/api/judge`.

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). `npm test` runs the headless
tests (a full x1000 demo run, pace model, scoring, questions library and
percentiles).

## Run the question server

Optional — the web app bundles the same library as a fallback, so it works without
the server:

```bash
cd question-server
npm start   # http://localhost:4000/questions
```

Set `VITE_QUESTION_SERVER_URL` for the web app if the server is elsewhere.

## Sound

Every kilometer milestone plays a short double beep (Web Audio oscillator, no assets)
and then the question is read aloud while it is on screen. Both are triggered from the
same simulated-clock milestone event as the question itself, so they stay in sync at
every demo multiplier. The audio context is created on the "Start run" click so the
first beep is not blocked by the browser autoplay policy.

Read-aloud (`web/src/tts.js`) uses ElevenLabs through the server's `/api/tts` when the
server has `ELEVENLABS_API_KEY`, and falls back to the browser's built-in
SpeechSynthesis otherwise. It can be turned off with the **Read questions aloud**
switch on the start screen, and a browser without speech synthesis simply stays silent.

## Voice answering

You can answer out loud. API keys live only on the server — the browser bundle and
the APK never contain one. The flow per question:

1. The question appears and is read aloud (see **Sound** above).
2. The microphone becomes available the moment the reading *starts* — the mic button
   unlocks then, so you can answer while the question is still being read.
3. Tap the mic, speak, tap again. The answer time (and therefore the score) is taken
   at that second tap, so transcription latency never costs you points.
4. What you said is transcribed by ElevenLabs Scribe through the server's `/api/stt`
   when it is configured (this is what works inside the Android WebView), otherwise
   by the browser's built-in **Web Speech API** (`SpeechRecognition` /
   `webkitSpeechRecognition`, Chromium only — see `web/src/stt.js`). `stop()` is
   bounded, so a recogniser that never ends cannot block the question.
5. The transcript is graded by `web/src/judge.js`, locally first: case, punctuation
   and filler words are normalized away ("It's Tokyo!" matches "Tokyo"), and a spoken
   sentence that contains the expected answer counts too ("he is playing Monopoly"
   is correct for "Monopoly"). Only if that fails is it sent to the server's
   `/api/judge`, which asks a Groq-hosted LLM whether the answer means the same
   thing. The server looks the question up by id, so the endpoint can only grade
   CogniRun questions — it is not an open LLM proxy.
6. Correct answers earn the time-decay points (100 → 50 over 60 s), wrong answers 0.
   The result card shows the transcript, the verdict and which rule decided it
   (`exact`, `contains`, `no-match`).

Typing stays available at all times (the text box under the mic button), so the run is
still playable when the mic is denied or the browser has no recogniser — the mic button
is then disabled and typing is the only input. Multiple-choice questions can still be
answered by tapping an option. Voice answering works in demo mode too.

Without `GROQ_API_KEY` on the server, `/api/judge` answers 503 and grading stays a
local string comparison, so a correct answer phrased entirely differently from the
expected one ("the Japanese capital") is marked wrong.

## Demo mode

Turn on **Demo mode** on the start screen to test the whole flow without a watch or
leaving your desk (it is off by default, so a real run is one tap away). It simulates GPS and heart rate: 6:00/km pace
with natural variation, slowing down for a while after each kilometer (the runner is
thinking about the question) and then recovering.

Pick a speed multiplier — **x1, x10, x100 or x1000** — on the start screen or during
the run to fast-forward through the full 3 km → 3 questions → results flow. At x1000
the running part of a 3 km run takes a couple of seconds.

Kilometer detection, the beep and the answer countdown all read one simulated clock,
never wall-clock time. The run stays frozen from the moment a question opens until
you dismiss the revealed answer, so reading time never adds simulated distance. The
multiplier scales running time only: while a question is open the clock drops to
real-time rate, so the 60 second answer window stays answerable (and scores stay
correct) at every multiplier.

Turn demo mode off to use the real sensors: browser Geolocation (`watchPosition`) for
distance/route and Web Bluetooth for a Garmin watch (or any strap) broadcasting the
standard BLE Heart Rate Service. Both require a secure context (https or localhost)
and a Chromium-based browser for Web Bluetooth.

## Heart rate from a Garmin watch

Real runs read live heart rate over the standard BLE Heart Rate Profile — service
`0x180D`, characteristic `0x2A37` (Heart Rate Measurement) — so any watch or chest
strap broadcasting heart rate works without a vendor SDK.

1. On the watch, start broadcast mode: **Menu → Sensors & accessories → Wrist heart
   rate → Broadcast heart rate** (wording varies slightly per model). The watch now
   advertises the HR service.
2. Open the app over https or localhost in a Chromium-based browser, turn **Demo mode**
   off and press **Start run**. Pairing is triggered from that click because Web
   Bluetooth requires user activation.
3. Pick the watch in the browser's Bluetooth chooser. The live screen shows the
   connection state under the heart rate, then streams the watch's beats into the run
   (heart rate, zone, and the heart rate track on the results chart).

Heart rate is never fatal to a run: no Bluetooth support, a cancelled chooser, a denied
permission or a failing GATT connection only show a warning under the heart rate and the
run continues on GPS alone. If the watch drops out mid-run the app retries with a backoff
(1/2/4/8 s) and resumes streaming when it comes back.

Demo mode never touches Bluetooth — its heart rate comes from the pace simulator in
`web/src/sensors/demo.js`, while real runs use `web/src/sensors/heartRate.js` via
`web/src/sensors/real.js`. `createRun({ demo })` picks one or the other, so the two paths
never mix.

## Server environment

Set these on Vercel (Project → Settings → Environment Variables), on Cloudflare Pages
(Settings → Variables and Secrets), on Render, or in
your shell for `question-server`. None of them are ever sent to the browser.

| Variable | Used for | Without it |
| --- | --- | --- |
| `GROQ_API_KEY` | `/api/judge` LLM grading | local string matching only |
| `GROQ_MODEL` | judge model override | `qwen/qwen3.8-27b` |
| `ELEVENLABS_API_KEY` | `/api/tts`, `/api/stt` | browser speech |
| `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STT_MODEL` | voice overrides | defaults in code |
| `ALLOWED_ORIGINS` | extra comma-separated origins allowed to call `/api/tts`, `/api/stt`, `/api/judge` | only the built-in list: the same host, the production hosts, `cognirun-*.vercel.app` previews, localhost, and the Android/iOS app |

`GET /health` reports `groq` and `eleven` booleans so you can confirm a deploy is
configured.

The three paid endpoints go through `question-server/apiGuard.js` on every
surface: a request from an unknown origin gets 403, each IP is rate-limited (per
server instance, best effort), and oversized bodies get 413.

Security headers, including the Content-Security-Policy, are kept in two
identical copies: `web/public/_headers` (Cloudflare Pages, also read by
`serve-app.mjs` for Render) and `vercel.json`. `e2e/csp.spec.mjs` fails if the
copies drift or if the app breaks the policy.

## Development harness

Everything is checked locally first, so GitHub Actions minutes are spent only on
confirmation. One-time setup from the repo root:

```bash
npm install                        # root tools + git hooks (husky)
npm --prefix web install
npx playwright install chromium
```

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over the web app, servers, API functions, tests and scripts |
| `npm test` | web + question-server unit tests (`node --test`) |
| `npm run e2e` | Playwright: a full x1000 demo run on the production build, plus a "no API keys in the bundle" check (run `npm --prefix web run build` first) |
| `npm run check` | the whole gate: lint → unit → build → e2e (`-- --fast` for lint + unit) |
| `npm run smoke:prod` | post-deploy check of https://cognirun.vercel.app (`SMOKE_URL=` for previews) |
| `npm run cf:dev` | serve `web/dist` plus `functions/` in Cloudflare's local runtime on :8788 (build first) |
| `npm run icons` | regenerate every app icon (Android mipmaps, favicon, PWA, apple-touch) and the OG image from `scripts/icons.mjs` |
| `npm run db:test` / `npm run db:backup` | pgTAP database tests on the local stack / local dump of the live database into `backups/` (git-ignored) |

The husky **pre-push** hook runs `npm run check`; `git push --no-verify` skips it in
an emergency.

## Deploy

- **Web + API:** Vercel deploys `main` automatically (`vercel.json`: builds `web/`,
  serves `api/*.mjs` as functions). After a merge, run `npm run smoke:prod`.
  Moving to Cloudflare Pages (like Quizrun) is ready in code; the dashboard setup and
  cutover steps are in [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).
- **CI:** `.github/workflows/ci.yml` runs lint, unit tests and the build on pull
  requests only.
- **Android:** `.github/workflows/android-build.yml` builds the APK only for a `v*`
  tag (or a manual run) and attaches `cognirun.apk` to that GitHub Release, which the
  app's download link points at. The APK contains no secrets; it calls the Vercel API.
- **Accounts and sync (Supabase):** the live project's public URL and anon key
  are in `web/.env.production`, so production builds have sign-in. Setup, schema
  and local database tests (`npm run db:test`): [docs/SUPABASE.md](docs/SUPABASE.md).