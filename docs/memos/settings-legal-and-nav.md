# Settings, legal pages and navigation memo

## Today's behaviour
- The tab bar has Run, Challenges, History, You and Settings. Each tab is a hash route (`#/settings`, `#/history/<id>`). Privacy, Terms and About are pages with no tab. Any other hash shows Run (`nav.js:6-21`).
- Settings has two preferences. **Read questions aloud** is applied when a run starts (`main.js:125`). **Default course** writes the same `settings.course` key as the course chips on the Run tab (`ui/settings.js:21-30`, `setup.js:117`). Both are saved to `cognirun.settings.v1` (`settings.js:3-9`).
- **Your data** says "N runs saved on this device". It can export JSON, and "Delete all runs" deletes every run it listed (`ui/settings.js:36-39,69-73`).
- Settings and the You tab link to Privacy, Terms and Contact (`ui/legal.js:138-139`, `ui/account.js:140`). Only Settings also links to About (`ui/settings.js:43-44`). The Back button on Privacy/Terms/About calls `history.back()` when there is any history; otherwise it goes to `#/settings` (`ui/legal.js:155-163`, `about.js:54-62`).
- To sign in, the user must tick a box agreeing to the terms. That tick is also the heart-rate consent. Nothing is uploaded until the current terms are accepted (`account.js:28-33`, `syncedStore.js:152-156`). Before that, `list()` still downloads account runs and `remove()` still deletes the remote copy (`syncedStore.js:208-214,226-234`).
- When something fails, at most 5 error reports per page load go to Supabase (`log_client_error`) with the message, stack, path#route, version and user agent (`logger.js:43-52`). Reporting is off only on `http://localhost` and `http://127.0.0.1`; the Android app runs on `https://localhost` and does report (`logger.js:60-66`).
- On the web, the "Get the Android app" link shows on the Run tab. A run hides it (`main.js:92,123`). The native app removes it (`main.js:29-30`).
- On Android, the hardware back button steps back through the hash history. At the first entry it does nothing (`AppPlugin.java:49-52`, and no JS listener in `web/src`).

## Facts checked against code
| Claim | Evidence (file:line) | Verdict |
|---|---|---|
| README: "Read questions aloud" switch is "on the start screen" | README.md:59-60; the switch is in `ui/settings.js:17-19`, and setup only shows a hint (`setup.js:102`) | wrong |
| README / MVP-PLAN: csp.spec keeps `_headers` and vercel.json identical | README.md:166-169, MVP-PLAN.md:372-373; `e2e/csp.spec.mjs:9-17` compares only the CSP value. The other 5 headers are equal today (node script). `/assets/*` Cache-Control is only in `_headers` | stale (CSP only) |
| MVP-PLAN: Settings tab = voice, default course, export/delete, version | MVP-PLAN.md:37; `ui/settings.js:10-46` | confirmed |
| `ui/settings.js:6-8`: "course for this run … stays on the Run tab" | Settings also writes `course` (`ui/settings.js:55-57`), the same key the Run tab uses | wrong |
| nav.js:2-4: Android back works through the hash history | `@capacitor/app` AppPlugin.java:49-52 calls `goBack` only when `canGoBack` | confirmed |
| stt.js:1-4: "Browser-native only … no external service" | stt.js:41-45 asks `/api/config`, then uses ElevenLabs via `/api/stt` (api/stt.mjs:46) | stale |
| clock.js:6: "can't overshoot 3km" | courses are 3K/5K/10K/300 m/60 m (config.js:8-14) | stale wording |
| Privacy: voice audio goes through our server to ElevenLabs, audio not stored | `ui/legal.js:36`; api/stt.mjs:46 forwards it and nothing writes it | confirmed, but incomplete (Q5) |
| Privacy: TTS sends only the question text | tts.js:40-44 `{text}` | confirmed |
| Privacy: Groq gets the question and answer text, no account details | judge.js:108-110 (no auth header); llmJudge.js:55-58 (prompt, expected answer, answer) | confirmed |
| Privacy: leaderboards show name and score, never email or route | score_plausibility.sql:61-72 returns name, points, correct, total, duration, distance, finished_at | confirmed (also shows time and distance) |
| Privacy: no ads, analytics or trackers | grep `gtag\|plausible\|posthog\|sentry\|fonts.google` over web/src and web/index.html finds nothing | confirmed |
| Privacy: error reports hold message, version, screen, device and account id | logger.js:43-52; app_log.sql:66 `auth.uid()` | confirmed (it also sends the stack) |
| Privacy: "Error reports are deleted after 30 days" | `ui/legal.js:63`; the only purge is inside `log_client_error` (app_log.sql:46-48), so old rows go only when a later report arrives, and there is no cron | wrong (bug 4) |
| Privacy: "Location and microphone are used only during a run" | `ui/legal.js:47`; GPS watch starts on "Connect GPS" at setup (main.js:103-104, devices.js:180-199). It is cleared only in `stop()` (devices.js:145,232-236), which main.js never calls | wrong (bug 3) |
| Privacy: deleting the account removes profile, runs and answers at once | migration 20261031:34-46 deletes auth.users, which cascades (accounts_runs.sql:29,105,213; app_log.sql:11) | confirmed |
| Privacy: device runs stay until deleted in Settings or the app is removed | store.js:23,67 cap 500 runs; sign-out drops synced copies (syncedStore.js:105-110) | incomplete |
| Privacy: hosting is "Vercel or Cloudflare" | `ui/legal.js:53`; only Vercel is live (refactoring-plan.md, Q2) | stale |
| About: "a run works without a connection" | about.js:38; questions are bundled with a fallback (questions.js:2-4,26-41), so an already-loaded page can run offline. There is no service worker (grep `serviceWorker` finds nothing), so the website can't be opened or reloaded offline. The APK bundles the app | partly true (Android, or a page already open) |
| About: scoring 100→50 over 60 s, then 0 | scoring.js | confirmed |
| Settings are sanitised on load | settings.js:12-19; node: multiplier '10'→1, voice 'no'→true, course '__proto__'→'3k' | confirmed |

## Bugs
1. **"Delete all runs" also deletes the account copy of every listed run.** *Symptom:* a signed-in user with no runs on this phone sees "1 run saved on this device". They confirm "Delete every run saved on this device?", and the run is gone from their account. It deletes the account copy and this device's copy; local copies on other devices stay. *Cause:* the count and the loop use the synced `store.list()`, which merges in account runs (`syncedStore.js:208-215`). `store.remove` also deletes the remote copy (`syncedStore.js:226-236` → `remoteStore.js:136-137`). The wording is in `ui/settings.js:36,70`. *Verified:* node script with fake local and remote stores: 0 local runs and 1 account run gave the label "1 run saved on this device". After the click, the account had 0 runs. Same bug as account-and-sync.md bug 4 and history-and-progress.md bug 6; this memo owns the fix. **High.**
2. **A slow Settings or Challenges render can replace the live run screen.** *Symptom:* open Settings on a slow connection, tap Run, then Start. The Settings page appears over the running quiz with no tab bar, and the run carries on unseen. *Cause:* these renderers `await store.list()` and then write `root.innerHTML` without checking that the route is still current (`ui/settings.js:49-51`, `challenges.js:186-192`). History already guards with a render token (`ui/history.js:116-121`). `syncedStore.list` can wait up to 3 s for auth (`syncedStore.js:29,60,209`). `showRoute` blocks new routes during a run (`main.js:54`) but not ones already in flight. *Verified:* node script with a stub store resolved after a fake "live run" render; the Settings markup overwrote it. Not reproduced in a browser. **Medium.**
3. **GPS stays on after the run, despite the privacy text.** *Symptom:* after "Connect GPS" the location indicator stays on through results and other tabs until the app is closed, which drains the battery. *Cause:* `watchPosition` starts on "Connect GPS" at setup (main.js:103-104, devices.js:199) and is cleared only by `stop()`/errors (devices.js:145,232-236). grep `devices\.` in main.js finds only `state`, `connectHeartRate` and `connectGps` (main.js:95,101,104). The notice says "used only during a run" (`ui/legal.js:47`). *Verified:* code read. **Medium** (legal mismatch).
4. **Error reports can outlive 30 days, indefinitely.** *Cause:* rows older than 30 days are deleted only when `log_client_error` is next called (app_log.sql:46-48), and there is no schedule. With no later report, old rows stay forever, against `ui/legal.js:63`. *Verified:* code read, plus grep for `cron`/`pg_cron` over supabase/ (no match). **Medium** (legal mismatch).
5. **Browser back during a run changes the route silently.** *Symptom:* the results page highlights another tab, and "New run" opens that page instead of setup. After a challenge run, "New run" always shows the challenge page. *Cause:* `hashchange` → `showRoute` returns early during a run (`main.js:54,245`). Results reads the current hash (`main.js:235`), and "New run" is `showRoute` (`main.js:238`, results.js:129,142). *Verified:* code read. **Low.**
6. **The Android download link vanishes after a run** on every tab until the Run tab is opened again. *Cause:* it is hidden at `main.js:123` and shown only in `showSetup` (`main.js:92`). CSS says it shows "on every screen" (style.css:663). *Verified:* code read. **Low.**
7. **Speech can go to the browser recogniser, which the notice doesn't list.** *Cause:* if the `/api/config` probe fails or says no ElevenLabs, `elevenLabsReady` stays false (stt.js:41-50). When `SpeechRecognition` exists, `sttMode()` is `browser` (stt.js:114-118) and the browser session starts (stt.js:248-263). *Verified:* code read. Whether a given browser (e.g. Chrome) sends that audio to Google is outside code evidence. **Medium** (disclosure).

### Suspicions (not verified)
- Back from Privacy/About in a tab that came from another site leaves CogniRun (`history.length > 1`, `ui/legal.js:159`). This may be intended, and e2e/legal.spec.mjs:3-18 covers only the in-app path.
- Android back at the first history entry does nothing, so back never exits the app (`AppPlugin.java:49-52`). This belongs in an Android memo.
- `routeHref` encodes params and `parseRoute` never decodes them (nav.js:18-25). This is harmless today because ids are UUIDs or `2026-W44-3k`.

## Proposal
1. Make "Delete all runs" device-only: count and delete local runs only, and keep the wording. *needs answer: Q1*
2. Make late renders no-ops in Settings and Challenges, the same way History already does (`ui/history.js:116-121`): return after the await if a newer render started or `running` changed. *no answer needed*
3. Make the GPS notice true: either start GPS at run start (not on "Connect GPS") and stop it when the run ends, or keep setup-time GPS, stop it at run end, and word the notice "during run setup and the run". `devices.stop()` also stops heart rate (devices.js:232-236), so add a GPS-only stop if HR should stay connected. Fixes bug 3. *needs answer: Q2*
4. Move the download-link `removeAttribute('hidden')` from `showSetup` to `showRoute` (`main.js:92`). *no answer needed*
5. On results, highlight `run` and make "New run" go to `#/run`. If the hash is already `#/run` there is no `hashchange`, so call `showRoute()` directly in that case (`main.js:235,238,245`). *no answer needed*
6. Remove "Default course" from Settings, because the Run tab already sets it. Fix the header comment. *needs answer: Q7*
7. Delete `calibration.js` and its test, `LEGAL_PAGES` (only a test uses it), and the `?? PAGES.privacy` fallback (see below). *no answer needed*
8. Fix stale comments and docs: README.md:59-60 (switch is in Settings), README.md:166-169 and MVP-PLAN.md:372-373 ("CSP value only"), stt.js:1-4, clock.js:6. *no answer needed*
9. Privacy text updates in one commit: retention (bug 4), processors, speech fallback (bug 7), consent withdrawal, device-run cap and sign-out. *needs answer: Q3, Q4, Q5, Q6*
10. About (about.js:38): say a run works offline in the Android app or once the website is open, but the website needs a connection to open or reload. *needs answer: Q8*

## What to delete
- `web/src/calibration.js` and `web/test/calibration.test.mjs`. `Select-String 'calibration'` over `*.js,*.mjs,*.md,*.yml,*.json` (no node_modules/dist) finds only the test import and MVP-PLAN.md:122-126 (closed PR #22, history). There are no imports from `web/src`, workflows or routes.
- `LEGAL_PAGES` (`ui/legal.js:136`). The same search finds only its definition and `web/test/legal.test.mjs:5,10-11`, so it is used only by a test. In that test, loop over the literal `['privacy', 'terms']` instead.
- The `?? PAGES.privacy` fallback (`ui/legal.js:143`). `renderLegal` is called only from `main.js:69` with `tab === 'privacy' || 'terms'`, and `parseRoute` only returns names in `PAGES` (nav.js:18-21).

## Questions
1. Should "Delete all runs" delete only this device's runs? **Default:** yes, device only. Account runs are already deleted per run in History or with the account.
2. GPS: start it at run start, or keep "Connect GPS" at setup and reword the notice to "during run setup and the run"? Either way, stop only GPS at run end and keep heart rate? **Default:** keep setup-time GPS (users want a fix before Start), add a GPS-only stop at run end, and reword the notice. Saves battery with no setup change.
3. Retention: add a scheduled purge or reword? **Default:** add a daily `pg_cron` purge in a new migration (timestamp >= `20261101000200`), since a reword like "deleted when a later report arrives" can't promise any limit. If cron isn't available, reword to "kept until cleaned up, normally about 30 days".
4. Processors: drop Cloudflare? **Default:** say "Vercel" until the Cloudflare cutover happens (refactoring-plan Q2).
5. Speech fallback: disclose Google, or drop the browser fallback? **Default:** drop the fallback and use ElevenLabs or typing, so there is one processor to disclose.
6. How does a user withdraw heart-rate consent? **Default:** say "delete your account or email us". No new UI.
7. Remove "Default course" from Settings? **Default:** yes, it is a second control for the same key.
8. About offline claim: reword or add a service worker? **Default:** reword (Proposal 10). A service worker is new architecture.
