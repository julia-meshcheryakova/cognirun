# CogniRun Android (Capacitor)

Native Android wrapper around the `/web` app, built with Capacitor.

- App id: `com.cognirun.app`, name: `CogniRun`
- `webDir` (in root `capacitor.config.json`) points at `web/dist` — the Vite production build.
- Capacitor plugins: `@capacitor/geolocation`, `@capacitor-community/bluetooth-le`,
  `@capacitor/app`, `@capacitor/browser`.
- Icons and the launch screen are generated: `node scripts/icons.mjs` (source mark:
  `scripts/logo-mark.svg`).

## Build a debug APK locally

```bash
# from repo root
npm install                 # Capacitor CLI + plugins
npm run build:web           # builds web/ -> web/dist
npx cap sync android        # copies web assets + plugins into android/
cd android
./gradlew assembleDebug     # needs Android SDK + JDK 21
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

## CI

`.github/workflows/android-build.yml` runs only on a `v*` tag or a manual dispatch (to
save Actions minutes). It uploads the `cognirun-apk` artifact and, for a tag, attaches
`cognirun.apk` to the GitHub Release.

Release signing is not set up — this produces a **debug** APK only.
