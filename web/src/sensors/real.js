import { createHeartRateMonitor } from './heartRate.js';

/**
 * Real sensors: Geolocation for the route, and the standard BLE Heart Rate
 * Profile (see heartRate.js) for a watch broadcasting heart rate, e.g. a Garmin.
 */
export function createRealSensors({
  onPosition,
  onHeartRate,
  onError,
  onHeartRateStatus,
  bluetooth,
}) {
  let watchId = null;
  const heartRate = createHeartRateMonitor({
    onHeartRate,
    onStatus: onHeartRateStatus,
    ...(bluetooth ? { bluetooth } : {}),
  });

  return {
    start() {
      if (!navigator.geolocation) {
        onError('Geolocation is not available in this browser.');
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) =>
          onPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            t: pos.timestamp,
          }),
        (err) => onError(`GPS error: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    },

    stop() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      heartRate.stop();
    },

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    connectHeartRate: heartRate.connect,
  };
}
