# Android and sensors memo

Scope: `web/src/sensors/*`, `hrZones.js`, the sensor parts of `ui/setup.js`, `ui/live.js`, `run.js` and `main.js`, plus the Android shell (manifest, `MainActivity.java`, `build.gradle`, `android-build.yml`, `android/README.md`). The app calls the raw `window.Capacitor.Plugins.X` proxies; `@capacitor/core` is not bundled.

I could not build or run the APK: there is no Android SDK or Java on this machine. Everything about Android behaviour below comes from reading the app code and the plugin sources in `node_modules` (`@capacitor/geolocation` 8.2.2, `@capacitor-community/bluetooth-le` 8.3.0, Capacitor 8 `native-bridge.js`). The JS paths were also run with throwaway Node scripts against fake plugins. The existing sensor tests pass (`node --test test/devices.test.mjs test/gps.test.mjs test/heart-rate.test.mjs test/setup-screen.test.mjs`: 26 pass), but none of them covers the native code paths.

## Today's behaviour
- The app creates one `devices` hub per page load and never stops it (`main.js:47`). The setup screen shows a Watch row and a GPS row, each with a connect chip (`setup.js:13-54`).
- **Connect Watch**
  - Web: opens the Chromium Bluetooth chooser filtered to service 0x180D.
  - Android: calls `ble.initialize({androidNeverForLocation:true})` (`heartRate.js:148`), opens the plugin's system picker filtered to 0x180D (`:67`), then opens an unfiltered picker (`:74`), then falls back to a manual scan (`:81`).
- **Connect GPS** starts one `watchPosition` (`devices.js:199`). After 15 s with no fix it says "No GPS fix yet" (`:6,189-197`). On Android this goes through the Geolocation plugin, which asks for permission first (`devices.js:24`).
- While a watch is connected, every beat repaints the whole devices card (`setup.js:133-135`).
- **Real run:** reuses the hub (`main.js:159`). Fixes worse than ±30 m are skipped. A move of no more than accuracy/2 counts as jitter (`run.js:96-106`). Pace shows `--:--` after 10 s with no fix (`run.js:14,169`).
- **Demo run:** GPS and pace are simulated. A watch connected on setup still supplies heart rate (`run.js:137-153`).
- Web watch drop: retries with a 1/2/4/8 s backoff (`heartRate.js:287-322`). Android watch drop: nothing happens (B3).
- The HR zone on the live screen uses a fixed max HR of 190 (`hrZones.js:1,12`; `live.js:158`).
- Android keeps the screen on for the whole app (`MainActivity.java`, FLAG_KEEP_SCREEN_ON). There is no foreground service and no background location permission (`AndroidManifest.xml:48-62`).

## Facts checked against code
| Claim | Evidence (file:line) | Verdict |
|---|---|---|
| Real sensors are "browser Geolocation and Web Bluetooth" (README:115-118) | On Android, both go through the Capacitor plugins (`devices.js:14-35`, `heartRate.js:26-30`) | stale |
| Press **Connect watch** on setup (README:129-131) | `setup.js:21` | confirmed |
| Live screen shows HR connection state (README:132-133) | `live.js:123-131` | confirmed |
| "heart rate track on the results chart" (README:134) | Only route and speed charts are drawn (`results.js:1,103-108`); HR appears only as Avg/Max numbers (`results.js:66-69`) | wrong |
| A cancelled chooser only shows a warning (README:136-137) | On Android, cancelling also kills GPS (B1) | wrong (Android) |
| Watch drop: retry with 1/2/4/8 s backoff (README:138-139, MVP-PLAN:61-62) | Web only (`heartRate.js:287-322`). The native monitor has no disconnect handler (B3) | wrong (Android) |
| GPS has accuracy/jitter filtering (MVP-PLAN:61) | `run.js:13,96-106` exists, but see S1 | confirmed, weak |
| Demo uses a real watch when one is connected (README:141-143) | `run.js:137-153` | confirmed |
| Plugins listed and `webDir` is `web/dist` (android/README:6-8) | `capacitor.config.json`, `package.json` | confirmed |
| JDK 21; CI runs on a `v*` tag or manual dispatch; `cognirun-apk` artifact; debug APK only (android/README:20,26-30) | `android-build.yml:7-10,22-26,51,54-65` | confirmed |
| The plugin is used "for background tracking" (`devices.js:9-10`) | No foreground service or background permission (manifest:48-62) | wrong |
| Garmin "often does NOT" advertise 0x180D vs "advertises 0x180D" | `heartRate.js:57-60` vs `:63-65` contradict each other | stale |
| `neverForLocation` matches the manifest | `heartRate.js:148` and `AndroidManifest.xml:57`. Android below 12 still asks for location (plugin `BluetoothLe.kt:119-125`) | confirmed |
| HR parser handles uint8 and uint16 via flag bit 0; RR intervals ignored | `heartRate.js:203-206`. A Node check gave 0x10→150 and 0x19 (uint16, energy, RR)→300 | confirmed |

## Bugs
1. **Android: cancelling the watch picker kills GPS (high).**
   - Symptom: after the user cancels or fails "Connect Watch", the setup screen still says "📍 GPS on" and "Looking for your watch…". The GPS watch is gone, so the next run never gains distance.
   - Cause: `devices.js:177` exports `monitor.connect` unbound and `main.js:101` calls `devices.connectHeartRate()`. Inside the monitor, `this.stop()` (`heartRate.js:165,171`) therefore runs `devices.stop()` (`devices.js:232-238`). That clears the GPS watch and resets both states without calling onChange. It also sets `stopped=true`, so `:172` returns before reporting 'failed'.
   - When it fires: the plugin's cancel message is "requestDevice cancelled." (`DeviceScanner.kt`), which `heartRate.js:70` rethrows. So simply cancelling triggers it.
   - Verified: Node repro with a fake plugin. GPS went from live to idle, `clearWatch` was called, and the last reported HR state was 'connecting'.
2. **Android manual-scan fallback always throws (medium).**
   - Cause: `heartRate.js:121-134` does `ble.addListener(...).then(...)`. The raw proxy's `addListener` returns a plain `{remove}` object, not a Promise (`native-bridge.js` addListener, `JSExport.java`). The result is a TypeError: the scan never starts, the `onScanResult` listener leaks, and B1 then runs.
   - When it fires: when both pickers fail with a non-cancel error. `await ble.addListener` at `:155` works only because awaiting a plain object returns it.
   - Verified: Node repro.
3. **Android: a dropped watch is never noticed (medium).**
   - Cause: the plugin emits `disconnected|<id>` (`BluetoothLe.kt:478-480`), but `heartRate.js` never subscribes to it (grep finds no `disconnected` in the native monitor, lines 51-196).
   - Symptom: the status stays "connected", the bpm stops updating, the Connect Watch chip stays hidden (`setup.js:14,19-21`), and nothing retries.
   - Verified: by reading the code only.
4. **Android asks for GPS fixes only every 20 s (medium).**
   - Cause: `GPS_OPTIONS.timeout` is 20000 (`devices.js:5`), and `nativeGeolocation` passes the timeout but no `interval` (`devices.js:26`). The plugin uses interval = timeout when no interval is given (`GeolocationPlugin.kt:335-355`, `definitions.d.ts:193-218`). That is the *desired* interval; `minimumUpdateInterval` defaults to 5 s, so Android may deliver fixes faster or slower.
   - Likely symptom: pace goes to `--:--` between fixes (stale after 10 s, `run.js:169`), distance jumps in steps, kilometre questions fire late, and HR is sampled only once per fix.
   - Verified: by reading the plugin source; not checked on a device.
5. **Android: denying location shows "No GPS signal — waiting" forever (medium).**
   - Cause: every error in the native watch callback is mapped to code 2 (`devices.js:27-28`), including the plugin's "Location permission request was denied." (`GeolocationPlugin.kt:144-160`). Code 2 means 'no-signal' (`devices.js:64-65`). The watch is kept (`:169`) and the Connect GPS chip is hidden (`setup.js:38-46`).
   - Related: with location services off, `requestPermissions` rejects, and that is mapped to code 1, which shows the wrong text "permission denied".
   - Verified: by reading the code and the plugin source.
6. **Demo run: every GPS fix throws a TypeError (low; new evidence for known bug 2).**
   - Cause: the demo `attach` passes no `onPosition` (`run.js:138-144`), but `devices.js:157` calls `run?.onPosition(...)`. Every fix then throws "run?.onPosition is not a function". It keeps throwing after the run ends, because the hub is never detached.
   - Impact: console noise only. Capacitor catches callback exceptions and logs them with `console.error` (`native-bridge.js:947-990`), so they never reach the global handlers in `logger.js:60-67`.
   - Verified: Node repro.

### Suspicions (not verified)
- **S1: Standing still adds distance.** The jitter test is measured from the last accepted fix (`run.js:106`). A simulated stationary phone (my noise model, not real GPS, ±10 m accuracy, 10 min) gained 0.8 km with drifting noise and 7 km with independent noise.
- **S2: Screen off or app switch probably stops tracking.** There is no foreground service and Android limits location while the app is not in use (manifest:48-62). Untested on a device.
- **S3: Taps on Connect GPS may be lost.** The card's innerHTML is rewritten on every beat (`setup.js:133-135`).
- **S4: Web double connect.** Pressing Connect Watch while 'reconnecting' does not clear `reconnectTimer` (`heartRate.js:240,309`), so two connects may race.
- **S5: Orphaned native watch.** Calling `clearWatch` before `requestPermissions` resolves (`devices.js:22-35`) may leave a native watch running.
- **S6: Play store visibility.** `bluetooth_le required="true"` (manifest:62) hides the app from phones without BLE, although HR is optional.
- **S7: A real run started with GPS idle waits forever.** It shows "Waiting for GPS…" (`live.js:36`) and nothing connects GPS, because only `ownDevices` does (`run.js:210`), so the run can never finish.

## Proposal
1. Fix B1: call the monitor's own `stop` instead of `this.stop`, and report 'failed' after an error. Add the GPS-survives-cancel case to `heart-rate.test.mjs`. No answer needed.
2. Delete `manualScan` (`heartRate.js:84-139`); `requestDevice` always exists on native. Needs answer: Q1.
3. Native disconnect: subscribe to `disconnected|<id>` and set the state to `failed` ("Watch disconnected") so the chip comes back. Remove the listener (or check `stopped`) before the deliberate `ble.disconnect()` in `stop()` (`heartRate.js:180-193`), or a normal stop reports "Watch disconnected" and leaks the listener. Needs answer: Q2.
4. Pass `interval: 1000` and `minimumUpdateInterval: 1000` in `nativeGeolocation` (`devices.js:26`). No answer needed.
5. Map native GPS errors by the plugin's code or message (denied → 'denied' and release the watch; location off → "Turn on location"). No answer needed.
6. Fix B6 together with step 3.2 of the refactoring plan: detach on demo stop and use `run?.onPosition?.(…)`. No answer needed.
7. Change the jitter filter in `run.js` `handlePosition` to keep the anchor until the displacement exceeds `max(accuracy, 5 m)`, with a pure-maths test. Needs answer: Q3.
8. Start GPS when a real run starts if it is idle (`devices.connectGps()` in the Start handler). Needs answer: Q4.
9. Set `bluetooth_le required="false"` (manifest:62). No answer needed.
10. Delete the test-only API listed below and move the tests to `createDevices({bluetooth, geolocation})`. No answer needed.
11. Fix the docs and comments:
    - README:115-118, 134 and 136-139
    - MVP-PLAN:61-62
    - `devices.js:9-11`
    - `heartRate.js:57-65`
    - an android/README line on the screen-on and foreground-only limits

    Needs answer: Q5.

Steps 3, 4, 5 and 9 can only be checked on a phone: tag a build or run `android-build.yml` manually, then sideload it.

## What to delete
- `real.js:36-40` (`connectHeartRate`, `requestPermission`) and `devices.requestGpsPermission` (`devices.js:202-218`). No caller in `web/src`; only tests use them (`gps.test.mjs:120`, `heart-rate.test.mjs:96,177,233`).
- The native `getCurrentPosition` wrapper (`devices.js:41-49`). Its only caller is `requestGpsPermission` (`devices.js:209`).
- The `run.js` `ownDevices`, `bluetooth` and `geolocation` options (`run.js:55-56,69-70,133-136,202,210`). Production always passes `devices` (`main.js:159`); only tests use these (`heart-rate.test.mjs:93,115,131,145,174,188,203,228`, `gps.test.mjs:59,135`, and the owned-device real run in `run-flow.test.mjs:138-150`).
- `manualScan` and its `onScanResult`/`requestLEScan` use (`heartRate.js:81-139`). It is broken (B2). It is not dead code: it is the fallback after both pickers reject with a non-cancel error (`heartRate.js:61-81`). Deleting it is a deliberate removal of a broken fallback, since the installed plugin implements `requestDevice` (`BluetoothLe.kt:307-346`).

## Questions
1. Keep the unfiltered second picker (`heartRate.js:73-78`) once the manual scan is gone? **Default:** keep. It is the only way to pick a watch that does not advertise 0x180D.
2. Should Android auto-reconnect a dropped watch like the web does? **Default:** no, just show "disconnected" and the chip. Less code, and it can't be tested here.
3. Which jitter threshold: `max(accuracy, 5 m)` from a fixed anchor? **Default:** yes. Simple, and it stops a stationary phone from adding distance.
4. Should Start connect GPS when it is idle? **Default:** yes. Otherwise a real run can never finish (S7).
5. Add a foreground service for screen-off tracking? **Default:** no. That is new native architecture; document "keep the app open, the screen stays on" instead.
6. Keep the fixed MAX_HR of 190? **Default:** keep. Personal zones are a feature, not a refactor.
