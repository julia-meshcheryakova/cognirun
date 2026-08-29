# CogniRun Android (skeleton)

Placeholder for the Android APK wrapper. Nothing here is functional yet — the plan is
to wrap the `/web` app so the phone build is the same app.

Intended approach (Capacitor):

```bash
cd web
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init CogniRun com.cognirun.app --web-dir=dist
npm run build && npx cap add android && npx cap sync
```

`capacitor.config.json` in this folder holds the intended app id/name for that step.
A plain `WebView` activity pointing at the built web bundle is the fallback if we
prefer not to depend on Capacitor.

Permissions the wrapper will need: `INTERNET`, `ACCESS_FINE_LOCATION`,
`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`.
