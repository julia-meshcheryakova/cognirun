# CogniRun Android (Capacitor)

Native Android wrapper around the `/web` app, built with Capacitor.

- App id: `com.cognirun.app`, name: `CogniRun`
- `webDir` (in root `capacitor.config.json`) points at `web/dist` — the Vite production build.
- Capacitor plugins: `@capacitor/geolocation`, `@capacitor-community/bluetooth-le`.

## Build a debug APK locally

```bash
# from repo root
npm install                 # Capacitor CLI + plugins
npm run build:web           # builds web/ -> web/dist
npx cap sync android        # copies web assets + plugins into android/
cd android
./gradlew assembleDebug     # needs Android SDK + JDK 17
# output: android/app/build/outputs/apk/debug/app-debug.apk
```

## CI

`.github/workflows/android-build.yml` builds the debug APK on every push/PR and
uploads it as the `cognirun-debug-apk` artifact (download from the Actions run).

Release signing is not set up — this produces a **debug** APK only.
