import { createHeartRateMonitor } from './heartRate.js';

/** Device state before anything has been connected. */
export const IDLE_DEVICES = { heartRate: { state: 'idle' }, gps: { state: 'idle' } };

/**
 * The watch (BLE heart rate) and GPS connections, owned by the app rather than by
 * a run: they are established on the setup screen from the user's tap — both APIs
 * need a user gesture — and the run then consumes whatever is already connected,
 * so no permission prompt appears mid-run. Connecting stays optional: a demo run
 * simulates both signals and a live run without them simply has no reading.
 *
 * `bluetooth` and `geolocation` are injectable so the flow can be tested without
 * real hardware.
 */
export function createDevices({
  onChange = () => {},
  bluetooth,
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
} = {}) {
  let heartRateState = { ...IDLE_DEVICES.heartRate };
  let gpsState = { ...IDLE_DEVICES.gps };
  let watchId = null;
  // Set while a run is listening; the panels keep updating either way.
  let run = null;

  function publish() {
    onChange(state());
  }

  function state() {
    return { heartRate: { ...heartRateState }, gps: { ...gpsState } };
  }

  function handleHeartRate(bpm) {
    heartRateState = { ...heartRateState, bpm };
    run?.onHeartRate(bpm);
    publish();
  }

  const monitor = createHeartRateMonitor({
    onHeartRate: handleHeartRate,
    onStatus(status) {
      heartRateState = { ...status, bpm: heartRateState.bpm };
      run?.onHeartRateStatus(status);
      publish();
    },
    ...(bluetooth ? { bluetooth } : {}),
  });

  return {
    state,

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: monitor.connect,

    /** Must be called from a user gesture (geolocation permission prompt). */
    connectGps() {
      if (watchId !== null) return;
      if (!geolocation) {
        gpsState = { state: 'unavailable', message: 'Location is not available in this browser.' };
        publish();
        return;
      }
      gpsState = { state: 'connecting', message: 'Waiting for a location fix…' };
      publish();
      watchId = geolocation.watchPosition(
        (pos) => {
          gpsState = { state: 'connected', accuracy: pos.coords.accuracy, message: 'Location tracked' };
          run?.onPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            t: pos.timestamp,
          });
          publish();
        },
        (err) => {
          gpsState = { state: 'failed', message: `GPS unavailable (${err.message})` };
          publish();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    },

    /** Hand the streams to a run; only one run listens at a time. */
    attach(handlers) {
      run = handlers;
      if (heartRateState.state !== 'idle') handlers.onHeartRateStatus(heartRateState);
    },

    detach() {
      run = null;
    },

    /** Close both connections; only the owner of the devices should call this. */
    stop() {
      run = null;
      monitor.stop();
      if (watchId !== null) geolocation?.clearWatch(watchId);
      watchId = null;
      heartRateState = { ...IDLE_DEVICES.heartRate };
      gpsState = { ...IDLE_DEVICES.gps };
    },
  };
}
