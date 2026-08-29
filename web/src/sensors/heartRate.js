export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];

/**
 * Heart Rate Measurement (0x2A37): bit 0 of the flags byte says whether the
 * value is 16-bit (little endian) or 8-bit; the rest of the packet (energy
 * expended, RR intervals) is not used here.
 */
export function parseHeartRate(value) {
  const flags = value.getUint8(0);
  return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
}

/**
 * Generic BLE Heart Rate Profile client (Web Bluetooth). Any watch or strap
 * broadcasting heart rate over BLE exposes this standard profile, including a
 * Garmin watch in "Broadcast heart rate" mode, so no vendor SDK is needed.
 *
 * `connect()` must be called from a user gesture (Web Bluetooth requirement).
 * Failures never throw at the caller: they are reported through `onStatus` so a
 * run keeps going without heart rate.
 *
 * `bluetooth` is injectable so the notification flow can be tested without a
 * real adapter.
 */
export function createHeartRateMonitor({
  onHeartRate,
  onStatus = () => {},
  bluetooth = typeof navigator === 'undefined' ? undefined : navigator.bluetooth,
} = {}) {
  let device = null;
  let characteristic = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let stopped = false;

  const deviceName = () => device?.name || 'Heart rate monitor';

  function handleValueChanged(event) {
    const bpm = parseHeartRate(event.target.value);
    if (bpm > 0) onHeartRate(bpm);
  }

  function detachCharacteristic() {
    if (!characteristic) return;
    characteristic.removeEventListener('characteristicvaluechanged', handleValueChanged);
    Promise.resolve(characteristic.stopNotifications?.()).catch(() => {});
    characteristic = null;
  }

  async function subscribe() {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    characteristic.addEventListener('characteristicvaluechanged', handleValueChanged);
    await characteristic.startNotifications();
  }

  function handleDisconnected() {
    detachCharacteristic();
    if (stopped) return;
    scheduleReconnect();
  }

  function scheduleReconnect() {
    if (reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      onStatus({
        state: 'lost',
        name: deviceName(),
        message: `Lost ${deviceName()} — continuing without heart rate.`,
      });
      return;
    }
    const delay = RECONNECT_DELAYS_MS[reconnectAttempt];
    reconnectAttempt += 1;
    onStatus({
      state: 'reconnecting',
      name: deviceName(),
      message: `${deviceName()} disconnected — reconnecting…`,
    });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      subscribe()
        .then(() => {
          reconnectAttempt = 0;
          onStatus({ state: 'connected', name: deviceName(), message: `${deviceName()} connected` });
        })
        .catch(() => {
          if (!stopped) scheduleReconnect();
        });
    }, delay);
    reconnectTimer.unref?.(); // don't hold a Node test process open
  }

  return {
    /**
     * Pick a device and start streaming. Resolves with the device name, or with
     * null when heart rate is unavailable (no adapter, no device picked,
     * permission denied) — the run continues either way.
     */
    async connect() {
      stopped = false;
      if (!bluetooth) {
        onStatus({
          state: 'unavailable',
          message: 'Web Bluetooth is not available — running without heart rate.',
        });
        return null;
      }
      try {
        onStatus({ state: 'connecting', message: 'Pick your watch or heart rate strap…' });
        device = await bluetooth.requestDevice({
          // A Garmin watch in broadcast mode advertises the HR service; the
          // optional entry keeps GATT access allowed for devices matched by the
          // browser's own picker filters.
          filters: [{ services: [HEART_RATE_SERVICE] }],
          optionalServices: [HEART_RATE_SERVICE],
        });
        device.addEventListener?.('gattserverdisconnected', handleDisconnected);
        await subscribe();
        reconnectAttempt = 0;
        onStatus({ state: 'connected', name: deviceName(), message: `${deviceName()} connected` });
        return deviceName();
      } catch (err) {
        device = null;
        onStatus({
          state: 'failed',
          message: `Heart rate unavailable (${err?.message || err}) — continuing without it.`,
        });
        return null;
      }
    },

    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectAttempt = 0;
      detachCharacteristic();
      if (device) {
        device.removeEventListener?.('gattserverdisconnected', handleDisconnected);
        if (device.gatt?.connected) {
          try {
            device.gatt.disconnect();
          } catch {
            /* already gone */
          }
        }
      }
      device = null;
    },
  };
}
