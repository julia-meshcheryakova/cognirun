# CogniRun — Discover your own

A 40-second, 30 fps Remotion advert for the Running Hackathon. Landscape (1920×1080) and portrait (1080×1920) compositions use the same story with individually adapted layouts.

## Finished videos

- [Widescreen MP4](out/cognirun-hackathon-16x9.mp4) — main pitch-screen version
- [Portrait MP4](out/cognirun-hackathon-9x16.mp4) — portrait sharing version
- [Landscape poster](out/cognirun-poster-landscape.jpg) / [portrait poster](out/cognirun-poster-portrait.jpg)

These finished exports and all editable source assets are included in the repository. Dependencies, browser bundles and temporary QA frames are excluded; the commands below regenerate them.

This is a text-led advert with an original instrumental soundtrack, not ElevenLabs-generated narration. All important copy is visible on screen, so the story works muted. The project does not require API keys.

Both MP4s have been rendered and checked for dimensions, duration, audio levels, scene layout and QR decoding. Details are in `QA.md`. When sharing the portrait video, include the clickable app link as well: https://dreamy-meringue-246d16.netlify.app/.

## Edit and render

```powershell
cd marketing/cognirun-ad
npm ci
npm run studio
```

The editable Studio opens at `http://localhost:3100/CogniRun-Landscape` (or `CogniRun-Portrait`).

```powershell
npm run typecheck
npm run assets
npm run stills
npm run verify:qr
npm run render
```

`npm run render:landscape` and `npm run render:portrait` render individual variants. The render script uses a separate headless browser profile and prefers an installed Chrome/Edge; otherwise Remotion obtains its supported renderer. It never takes over the user's existing browser tabs. `REMOTION_BROWSER_EXECUTABLE` can override that executable.

## Timeline

| Seconds | Scene |
| --- | --- |
| 0–2 | Great minds. Different rituals. |
| 2–4 | Darwin walked. |
| 4–6 | Hemingway stood. |
| 6–8 | Murakami ran. |
| 8–12 | What works for you? |
| 12–18 | One Stanford experiment: approximately 60% more creative ideas while walking |
| 18–22 | Not every task. Not every person. |
| 22–24 | Meet CogniRun. |
| 24–30 | ROXFIT body data + ElevenLabs voice interaction, clearly illustrated |
| 30–34 | Repeat to test patterns. |
| 34–40 | Discover your own. Scan the QR code. |

## Editing notes

- Each scene lives in `src/scenes/` and uses frame-driven animation. No CSS animation clocks or non-deterministic random data are used.
- Change the final URL in `scripts/generate-qr.mjs`, then run it to regenerate the QR.
- Keep the expected URL in `scripts/verify-qr.mjs` in sync; it checks that the source QR and rendered end cards decode correctly.
- All invented app data and charts carry explicit illustrative/prototype labels.
- The approximately 60% result is a published experiment, not a CogniRun outcome, IQ gain or personal guarantee.
- The anonymous runner is original AI-generated campaign artwork; no famous-person image or endorsement is implied.
- The study result, historical examples, asset provenance and full generation prompt are recorded in `SOURCES.md`.
- Audio is synthesized locally by `scripts/generate-audio.mjs`: no downloaded music or samples. It is not an ElevenLabs product demonstration.
- For a voiced edition, record or generate narration separately with permission and credentials, adjust scene timing to that delivery, and duck the instrumental. Do not imply a sponsor created the current soundtrack.

This directory is isolated from the app. No app code or public deployment is changed by creating or rendering the advert.
