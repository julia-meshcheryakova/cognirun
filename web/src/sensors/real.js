const HEART_RATE_SERVICE = 0x180d;
const HEART_RATE_MEASUREMENT = 0x2a37;

function parseHeartRate(value) {
  const flags = value.getUint8(0);
  return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
}

/**
 * Real sensors: Geolocation for the route, Web Bluetooth (standard BLE Heart
 * Rate Service) for a watch broadcasting heart rate, e.g. a Garmin.
 */
export function createRealSensors({ onPosition, onHeartRate, onError }) {
  let watchId = null;
  let hrCharacteristic = null;

  function handleHrEvent(event) {
    onHeartRate(parseHeartRate(event.target.value));
  }

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
      if (hrCharacteristic) {
        hrCharacteristic.removeEventListener('characteristicvaluechanged', handleHrEvent);
        hrCharacteristic.stopNotifications().catch(() => {});
        hrCharacteristic = null;
      }
    },

    /** Must be called from a user gesture (Web Bluetooth requirement). */
    async connectHeartRate() {
      if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available.');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      hrCharacteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      hrCharacteristic.addEventListener('characteristicvaluechanged', handleHrEvent);
      await hrCharacteristic.startNotifications();
      return device.name || 'Heart rate monitor';
    },
  };
}
