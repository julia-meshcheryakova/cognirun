# CogniRun

Run 3 km; after every completed kilometer the app beeps and asks a question — one
per cognitive dimension: trivia at km 1, logic at km 2, maths at km 3. Answering
faster scores more points (100 points instantly → 50 points at 60 seconds). After
3 km and 3 questions you get a results page with the score breakdown, a
population-relative percentile per category, the GPS route and the pace profile.

- `web/` — the browser app (all functionality lives here)
- `question-server/` — the questions library and the HTTP API serving it
- `android/` — skeleton wrapper that will host the web app in a WebView later
- `docs/QUESTIONS-SPEC.md` — categories, library, selection and percentile framing

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

Read-aloud can be turned off with the **Read questions aloud** switch on the start
screen, and it is fully optional: if no ElevenLabs key is configured — or the request
fails — the app falls back to the browser's built-in SpeechSynthesis, and if that is
missing too it stays silent.

### Enabling the ElevenLabs voice

```bash
cp web/.env.example web/.env.local
# then set VITE_ELEVENLABS_API_KEY=sk_... (and optionally VITE_ELEVENLABS_VOICE_ID)
npm run dev   # restart Vite so it picks up the env file
```

`web/.env.local` is git-ignored. `VITE_*` vars are inlined into the client bundle, so
for a public deployment proxy the ElevenLabs call through a small backend instead. For
a quick test without rebuilding you can set the key at runtime in the browser console:

```js
localStorage.setItem('cognirun.elevenLabsApiKey', 'sk_...'); // or window.COGNIRUN_ELEVENLABS_API_KEY = 'sk_...'
```

Request used (see `web/src/tts.js`): `POST https://api.elevenlabs.io/v1/text-to-speech/<voiceId>`
with the `xi-api-key` header, `model_id: eleven_turbo_v2_5` and
`voice_settings: { stability: 0.4, similarity_boost: 0.8 }`; the returned MP3 is played
via an `Audio` element. Default voice id `21m00Tcm4TlvDq8ikWAM` ("Rachel").

## Demo mode

Demo mode is **on by default** on the start screen, so you can test the whole flow
without a watch or leaving your desk. It simulates GPS and heart rate: 6:00/km pace
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
