# CogniRun

Run 3 km; after every completed kilometer the app beeps and asks a lateral-thinking
question. Answering faster scores more points (100 points instantly → 50 points at
60 seconds). After 3 km and 3 questions you get a results page with the score
breakdown, the GPS route and the pace profile.

- `web/` — the browser app (all functionality lives here)
- `android/` — skeleton wrapper that will host the web app in a WebView later

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

## Demo mode

Demo mode is **on by default** on the start screen, so you can test the whole flow
without a watch or leaving your desk. It simulates GPS and heart rate: 6:00/km pace
with natural variation, slowing down for a while after each kilometer (the runner is
thinking about the question) and then recovering.

Pick a speed multiplier — **x1, x10 or x20** — on the start screen or during the run
to fast-forward through the full 3 km → 3 questions → results flow. At x20 a full run
takes about a minute. The 60 second answer window is always real time.

Turn demo mode off to use the real sensors: browser Geolocation (`watchPosition`) for
distance/route and Web Bluetooth for a Garmin watch (or any strap) broadcasting the
standard BLE Heart Rate Service. Both require a secure context (https or localhost)
and a Chromium-based browser for Web Bluetooth.
