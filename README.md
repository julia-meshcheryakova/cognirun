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

## Demo mode

Demo mode is **on by default** on the start screen, so you can test the whole flow
without a watch or leaving your desk. It simulates GPS and heart rate: 6:00/km pace
with natural variation, slowing down for a while after each kilometer (the runner is
thinking about the question) and then recovering.

Pick a speed multiplier — **x1, x10, x100 or x1000** — on the start screen or during
the run to fast-forward through the full 3 km → 3 questions → results flow. At x1000
the running part of a 3 km run takes a couple of seconds.

Kilometer detection, the beep and the answer countdown all read one simulated clock,
never wall-clock time. The multiplier scales running time only: while a question is
open the clock drops to real-time rate, so the 60 second answer window stays
answerable (and scores stay correct) at every multiplier.

Turn demo mode off to use the real sensors: browser Geolocation (`watchPosition`) for
distance/route and Web Bluetooth for a Garmin watch (or any strap) broadcasting the
standard BLE Heart Rate Service. Both require a secure context (https or localhost)
and a Chromium-based browser for Web Bluetooth.
