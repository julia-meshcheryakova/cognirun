# CogniRun

**Find the pace of your best thinking.**

CogniRun is a voice-first brain-and-body experiment built around ROXFIT activity data and ElevenLabs voice. It compares reasoning, working memory, recall, and idea fluency while a participant is seated, standing, walking, running in personalized heart-rate zones, and recovering.

The scientific premise, primary sources, current limitations, and research-mode upgrade are documented in [RESEARCH.md](./RESEARCH.md).

The repository contains a complete offline-safe hackathon app plus optional live adapters:

- ROXFIT-shaped deterministic telemetry sandbox for a reliable demo
- Garmin Bluetooth Heart Rate broadcast integration
- Phone GPS pace and distance integration
- ElevenLabs TTS and Scribe v2 STT through a server-side proxy
- Browser speech fallback when ElevenLabs credentials are absent
- Explore-v1 protocol state machine
- Personal Brain × Body results, motor-cost analysis, raw event log export
- Clearly separated research-informed synthetic cohort simulator
- Capacitor Android wrapper

## Hackathon advert

The [40-second Remotion advert](marketing/cognirun-ad/README.md) includes editable source, original artwork and music, research notes, and ready-to-share [widescreen](marketing/cognirun-ad/out/cognirun-hackathon-16x9.mp4) and [portrait](marketing/cognirun-ad/out/cognirun-hackathon-9x16.mp4) MP4s. Its dependencies and rendering commands are separate from the app.

## Run it

```powershell
npm ci
npm run dev
```

Open <http://localhost:4173>.

The default experience needs no credentials. In setup, choose **Judge demo**, keep **Auto-answer demo** enabled, accept the two local safety statements, and begin. The full protocol completes in roughly one minute while preserving real wall-clock response timing.

## Enable ElevenLabs

Set environment variables before starting the local server:

```powershell
$env:ELEVENLABS_API_KEY="your-key"
$env:ELEVENLABS_VOICE_ID="JBFqnCBsd6RMkjVDRZzb"
npm run dev
```

The API key stays server-side. CogniRun uses:

- `eleven_flash_v2_5` for low-latency prompt delivery
- `scribe_v2` for recorded response transcription
- local voice-onset detection for response timing

Copy `.env.example` for the full set of optional variables. Do not put a key inside `www/` or commit it.

## ROXFIT integration boundary

ROXFIT's official [product guide](https://www.roxfit.app/how-it-works/) and [wearable guide](https://roxfit.app/blog/wear-os-guide/) document live targets, heart rate, pace, and workout synchronization. The hackathon brief additionally promises live activity and distance through an event API. A public event payload schema is not available before the event, so this build defines a narrow normalization boundary instead of pretending an undocumented schema exists.

Set `ROXFIT_API_URL` and, when required, `ROXFIT_API_TOKEN`. The server proxies that single configured endpoint at `/api/roxfit/live` without exposing the token. `normaliseRoxfitSample()` accepts a top-level object or `activity`/`sample`/`data` wrapper with explicitly unit-labelled fields such as `hrBpm`, `speedMps`, `distanceM`/`distanceKm`, and `cadenceSpm`.

The physical data boundary lives in `www/js/telemetry.js`:

1. Prefer live ROXFIT fields when partner access is supplied.
2. Otherwise use Garmin BLE for HR and phone GPS for pace/distance.
3. Keep the explicit **ROXFIT sandbox** for an offline judge demo.

Simulation is visually labelled and stored with `synthetic: true`; it never silently replaces a failed live source.

Ask the ROXFIT team for current HR, zone, pace, distance, cadence, timestamps, update frequency, stage events, authentication, and result write-back before binding their live adapter.

## Architecture

```text
www/js/protocol.js   Explore-v1 stages, personal zones, deterministic task schedule
www/js/questions.js  Matched task forms and synthetic study profiles
www/js/telemetry.js  ROXFIT sandbox, Garmin BLE, phone GPS, field provenance
www/js/voice.js      ElevenLabs proxy client, local voice timing, browser fallback
www/js/metrics.js    Raw scoring, CogniIndex curves, recovery and motor cost
www/js/store.js      Append-only events, local persistence and JSON export
www/js/charts.js     Dependency-free SVG charts
www/js/app.js        UI orchestration and end-to-end session loop
server.mjs           Static server and protected ElevenLabs proxy
```

Protocol time, wall-clock voice latency, research scores, and demo acceleration are deliberately separate.

## Verify

```powershell
npm run verify
```

This runs syntax/HTML checks and deterministic unit tests for heart-rate zones, protocol transitions, task scoring, response normalization, motor cost, and the telemetry simulator.

## Android

The native app requests internet, microphone, GPS, and Bluetooth LE permissions. It also keeps the display awake during an active foreground session.

```powershell
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

The debug APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For a phone connecting to the local ElevenLabs proxy, expose the development server on the same network and configure the Capacitor server URL only for that development run. The production architecture should use a deployed HTTPS proxy.

## Scientific guardrails

- CogniIndex is baseline-relative and is not IQ.
- First-session insights are explicitly provisional.
- Accuracy and response time remain separately inspectable.
- Low-confidence voice is missing/uncertain data, not automatically wrong.
- Standing is a posture control, not a promised improvement.
- Concurrent high-intensity tasks are intended for a closed track; all-out sprint cognition is assessed after stopping.
- Synthetic cohort data is permanently labelled and excluded from real participant counts.
- CogniRun is an exploratory wellness/research tool, not a diagnostic or medical device.
