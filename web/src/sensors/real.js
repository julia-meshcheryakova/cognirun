import { createHeartRateMonitor } from './heartRate.js';

const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
const NO_FIX_WARNING_MS = 15_000;

/** Never fatal on its own: a run keeps going, it just cannot gain distance yet. */
function gpsErrorStatus(err) {
  switch (err?.code) {
    case 1:
      return {
        state: 'denied',
        message: 'Location permission denied — allow location to track distance.',
      };
    case 2:
      return { state: 'no-signal', message: 'No GPS signal — waiting for a fix…' };
    case 3:
      return { state: 'no-signal', message: 'GPS is slow to respond — waiting for a fix…' };
    default:
      return { state: 'failed', message: `GPS error: ${err?.message || err}` };
  }
}

/**
 * Real sensors: Geolocation for the route, and the standard BLE Heart Rate
 * Profile (see heartRate.js) for a watch broadcasting heart rate, e.g. a Garmin.
 *
 * `geolocation` is injectable so the distance path can be tested without a real
 * device.
 */
export function createRealSensors({
  onPosition,
  onHeartRate,
  onError,
  onHeartRateStatus,
  onGpsStatus = () => {},
  bluetooth,
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
}) {
  let watchId = null;
  let noFixTimer = null;
  let fixes = 0;
  const heartRate = createHeartRateMonitor({
    onHeartRate,
    onStatus: onHeartRateStatus,
    ...(bluetooth ? { bluetooth } : {}),
  });

  function clearNoFixTimer() {
    if (noFixTimer) clearTimeout(noFixTimer);
    noFixTimer = null;
  }

  function handleFix(pos) {
    fixes += 1;
    clearNoFixTimer();
    onGpsStatus({ state: 'live', message: `GPS ±${Math.round(pos.coords.accuracy)} m` });
    onPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      t: pos.timestamp,
    });
  }

  function handleError(err) {
    onGpsStatus(gpsErrorStatus(err));
  }

  return {
    start() {
      if (!geolocation) {
        onGpsStatus({ state: 'unavailable', message: 'No GPS in this browser.' });
        onError('Geolocation is not available in this browser, so distance cannot be tracked.');
        return;
      }
      onGpsStatus({ state: 'waiting', message: 'Waiting for GPS…' });
      noFixTimer = setTimeout(() => {
        noFixTimer = null;
        if (fixes === 0) {
          onGpsStatus({
            state: 'no-signal',
            message: 'No GPS fix yet — distance stays at 0 until the signal arrives.',
          });
        }
      }, NO_FIX_WARNING_MS);
      noFixTimer.unref?.(); // don't hold a Node test process open
      watchId = geolocation.watchPosition(handleFix, handleError, GPS_OPTIONS);
    },

    stop() {
      clearNoFixTimer();
      if (watchId !== null) geolocation?.clearWatch(watchId);
      watchId = null;
      heartRate.stop();
    },

    /**
     * Must be called from a user gesture: browsers show the location prompt
     * against the Start click, and an early fix warms up the GPS.
     */
    requestPermission() {
      if (!geolocation) return Promise.resolve(false);
      return new Promise((resolve) => {
        geolocation.getCurrentPosition(
          () => resolve(true),
          (err) => {
            handleError(err);
            resolve(false);
          },
          GPS_OPTIONS,
        );
      });
    },

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: heartRate.connect,
  };
}
