import { createHeartRateMonitor } from './heartRate.js';

const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
const NO_FIX_WARNING_MS = 15_000;

/** Device state before anything has been connected. */
export const IDLE_DEVICES = { heartRate: { state: 'idle' }, gps: { state: 'idle' } };

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
 * The watch (BLE heart rate) and the GPS watch, owned by the app rather than by a
 * run: they are connected on the setup screen from the user's tap — both APIs need
 * a user gesture — and a run then consumes whatever is already connected, so no
 * permission prompt appears mid-run. Connecting stays optional: a demo run
 * simulates both signals, and a live run without them simply has no reading.
 *
 * `bluetooth` and `geolocation` are injectable so the flow can be tested without
 * real hardware.
 */
export function createDevices({
  onChange = () => {},
  onError = () => {},
  bluetooth,
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
} = {}) {
  let heartRateState = { ...IDLE_DEVICES.heartRate };
  let gpsState = { ...IDLE_DEVICES.gps };
  let watchId = null;
  let noFixTimer = null;
  let fixes = 0;
  // Set while a run is listening; the setup panels keep updating either way.
  let run = null;

  function state() {
    return { heartRate: { ...heartRateState }, gps: { ...gpsState } };
  }

  function setHeartRate(patch) {
    heartRateState = { ...heartRateState, ...patch };
    onChange(state());
  }

  function setGps(status) {
    gpsState = { ...status };
    run?.onGpsStatus?.(status);
    onChange(state());
  }

  function clearNoFixTimer() {
    if (noFixTimer) clearTimeout(noFixTimer);
    noFixTimer = null;
  }

  const monitor = createHeartRateMonitor({
    onHeartRate(bpm) {
      setHeartRate({ bpm });
      run?.onHeartRate(bpm);
    },
    onStatus(status) {
      heartRateState = { ...status, bpm: heartRateState.bpm };
      onChange(state());
      run?.onHeartRateStatus?.(status);
    },
    ...(bluetooth ? { bluetooth } : {}),
  });

  function releaseWatch() {
    clearNoFixTimer();
    if (watchId !== null) geolocation?.clearWatch(watchId);
    watchId = null;
  }

  function handleFix(pos) {
    fixes += 1;
    clearNoFixTimer();
    setGps({
      state: 'live',
      accuracy: pos.coords.accuracy,
      message: `GPS ±${Math.round(pos.coords.accuracy)} m`,
    });
    run?.onPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      t: pos.timestamp,
    });
  }

  function handleError(err) {
    const status = gpsErrorStatus(err);
    // A denied or broken watch never recovers, so drop it and let the setup screen
    // offer Connect GPS again; a missing signal keeps the watch waiting.
    if (status.state !== 'no-signal') releaseWatch();
    setGps(status);
  }

  return {
    state,

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: monitor.connect,

    /** Must be called from a user gesture (it raises the location prompt). */
    connectGps() {
      if (watchId !== null) return;
      if (!geolocation) {
        setGps({ state: 'unavailable', message: 'No GPS in this browser.' });
        onError('Geolocation is not available in this browser, so distance cannot be tracked.');
        return;
      }
      fixes = 0;
      setGps({ state: 'waiting', message: 'Waiting for GPS…' });
      noFixTimer = setTimeout(() => {
        noFixTimer = null;
        if (fixes === 0) {
          setGps({
            state: 'no-signal',
            message: 'No GPS fix yet — distance stays at 0 until the signal arrives.',
          });
        }
      }, NO_FIX_WARNING_MS);
      noFixTimer.unref?.(); // don't hold a Node test process open
      watchId = geolocation.watchPosition(handleFix, handleError, GPS_OPTIONS);
    },

    /**
     * Must be called from a user gesture: an early fix warms up the GPS and
     * confirms the permission without waiting for the watch.
     */
    requestGpsPermission() {
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

    /** Hand the streams to a run; only one run listens at a time. */
    attach(handlers) {
      run = handlers;
      if (heartRateState.state !== 'idle') handlers.onHeartRateStatus?.(heartRateState);
      if (gpsState.state !== 'idle') handlers.onGpsStatus?.(gpsState);
    },

    detach() {
      run = null;
    },

    /** Close both connections; only the owner of the devices should call this. */
    stop() {
      run = null;
      monitor.stop();
      releaseWatch();
      heartRateState = { ...IDLE_DEVICES.heartRate };
      gpsState = { ...IDLE_DEVICES.gps };
    },
  };
}
