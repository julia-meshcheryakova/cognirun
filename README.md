# CogniRun

Android app for CogniRun — run 5 km while solving 10 lateral-thinking puzzles unlocked at distance milestones. Live heart-rate from a Garmin fēnix over BLE.

**Stack:** Capacitor (web UI in `www/index.html`) + Android shell, `@capacitor-community/bluetooth-le` for HR, `@capacitor/geolocation` for GPS.

## Build
```
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
