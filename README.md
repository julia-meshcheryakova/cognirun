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

## Voice answering

You answer by speaking. The flow per question:

1. The question appears and is read aloud (see **Sound** above).
2. The microphone becomes available the moment the reading *starts* — the mic button
   unlocks then, so you can answer while the question is still being read.
3. Tap the mic, speak, tap again. The answer time (and therefore the score) is taken
   at that second tap, so transcription and judging latency never cost you points.
4. The recording is transcribed by **ElevenLabs Speech-to-Text ("Scribe")**
   (`web/src/stt.js`).
5. The transcript is graded by `web/src/judge.js`: **exact match first** (free and
   instant, after normalizing case, punctuation and filler words — "It's Tokyo!"
   matches "Tokyo"), and if that fails an **LLM-as-a-judge** call decides semantic
   correctness ("he is playing Monopoly" counts for "Monopoly").
6. Correct answers earn the time-decay points (100 → 50 over 60 s), wrong answers 0.
   The result card shows the verdict, the transcript and which path judged it.

Typing stays available at all times (the text box under the mic button), so the run is
still playable if the mic is denied or unavailable, and multiple-choice questions can
still be answered by tapping an option. Voice answering works in demo mode too.

### Speech-to-text key

The STT calls use the same ElevenLabs key as the read-aloud voice
(`VITE_ELEVENLABS_API_KEY`, see above; the runtime `localStorage` override works too).
Request used: `POST https://api.elevenlabs.io/v1/speech-to-text` with the
`xi-api-key` header, `model_id: scribe_v1` and the recorded audio as multipart `file`
(captured with `getUserMedia` + `MediaRecorder`).

With no ElevenLabs key the app degrades to the browser's built-in **Web Speech API**
(`SpeechRecognition`, Chromium only), so voice answering still works. With neither, the
mic button is disabled and typing is the only input.

### LLM judge key

```bash
# in web/.env.local
VITE_GROQ_API_KEY=gsk_...   # free tier, https://console.groq.com/keys
```

The judge calls Groq's OpenAI-compatible endpoint
`POST https://api.groq.com/openai/v1/chat/completions` with `llama-3.3-70b-versatile`,
`temperature: 0` and `response_format: json_object`; the model is given the question,
the expected answer and the transcript and replies `{"correct": bool, "reason": "…"}`.
It is bounded by a 6 s timeout. Runtime override for a quick test:

```js
localStorage.setItem('cognirun.groqApiKey', 'gsk_...'); // or window.COGNIRUN_GROQ_API_KEY = 'gsk_...'
```

If no Groq key is configured — or the call fails or times out — grading falls back to
**exact match only**, and the result card says so (`judged by exact-only`), which means
a correct-but-differently-phrased answer will be marked wrong.

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
