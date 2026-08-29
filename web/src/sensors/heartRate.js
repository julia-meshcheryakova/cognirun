export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

// Full 128-bit forms of the adopted 16-bit UUIDs; the native BLE plugin keys its
// scan filters and notification events off these strings, not the 0x180d shorthand.
const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];

/**
 * The native @capacitor-community/bluetooth-le plugin, or null on the web / when
 * a test injects its own `bluetooth`. Kept behind a getter so the module still
 * imports in Node (no `window`).
 */
function nativeBle() {
  const cap = typeof window === 'undefined' ? undefined : window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.BluetoothLe ?? null;
}

/**
 * Notification payloads from the native plugin arrive as a base64/hex-ish string
 * rather than a live DataView, so rebuild a DataView before parsing.
 */
function dataViewFromNative(value) {
  if (value && typeof value === 'object' && value.buffer) return value;
  const hex = String(value || '').replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new DataView(bytes.buffer);
}

/**
 * Native (Android WebView) heart-rate monitor built on the BluetoothLe plugin,
 * since Android WebView has no `navigator.bluetooth`. Same public shape as the
 * web monitor (connect/stop) so `createHeartRateMonitor` can delegate to it.
 */
function createNativeHeartRateMonitor({ ble, onHeartRate, onStatus }) {
  let deviceId = null;
  let deviceLabel = 'Heart rate monitor';
  let notifyListener = null;
  let stopped = false;

  // A Garmin watch in Broadcast-HR mode often does NOT put the 0x180D service in
  // its advertisement packet, so a service-filtered scan never sees it. Scan
  // unfiltered, collect candidates over a short window, then prefer one that
  // advertises the HR service (a real strap) or looks like a watch by name.
  async function scanForDevice() {
    return new Promise((resolve, reject) => {
      let settled = false;
      let scanListener = null;
      const candidates = new Map();

      const finish = async (device, err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(pick);
        await ble.stopLEScan().catch(() => {});
        await scanListener?.remove?.().catch(() => {});
        if (device) resolve(device);
        else reject(err ?? new Error('No heart rate device found — enable broadcast on the watch.'));
      };

      const best = () => {
        const all = [...candidates.values()];
        // A device advertising the HR service is the surest bet (chest straps).
        const withHr = all.find((c) => c.hasHrService);
        if (withHr) return withHr.device;
        // Otherwise a named device is more likely the watch than a bare MAC.
        const named = all.find((c) => c.device.name);
        return named?.device ?? all[0]?.device ?? null;
      };

      // Give the scan a moment to gather a few adverts, then take the best match.
      const pick = setTimeout(() => {
        const device = best();
        if (device) finish(device);
      }, 4000);
      pick.unref?.();

      const timeout = setTimeout(() => finish(best()), 15000);
      timeout.unref?.();

      ble.addListener('onScanResult', (result) => {
        const device = result?.device;
        if (!device?.deviceId) return;
        const uuids = (result.uuids || []).map((u) => String(u).toLowerCase());
        const hasHrService = uuids.includes(HEART_RATE_SERVICE_UUID);
        candidates.set(device.deviceId, { device, hasHrService });
        // A confirmed HR advertiser is unambiguous — take it immediately.
        if (hasHrService) finish(device);
      }).then((listener) => {
        scanListener = listener;
        return ble.requestLEScan({ allowDuplicates: false });
      }).catch((err) => finish(null, err));
    });
  }

  return {
    async connect() {
      stopped = false;
      try {
        onStatus({ state: 'connecting', message: 'Pick your watch or heart rate strap…' });
        // androidNeverForLocation matches the manifest flag so BLE scan needs no
        // location grant on Android 12+.
        await ble.initialize({ androidNeverForLocation: true });
        const device = await scanForDevice();
        if (stopped) return null;
        deviceId = device.deviceId;
        deviceLabel = device.name || 'Heart rate monitor';
        await ble.connect({ deviceId });
        const key = `notification|${deviceId}|${HEART_RATE_SERVICE_UUID}|${HEART_RATE_MEASUREMENT_UUID}`;
        notifyListener = await ble.addListener(key, (result) => {
          const bpm = parseHeartRate(dataViewFromNative(result?.value));
          if (bpm > 0) onHeartRate(bpm);
        });
        await ble.startNotifications({
          deviceId,
          service: HEART_RATE_SERVICE_UUID,
          characteristic: HEART_RATE_MEASUREMENT_UUID,
        });
        if (stopped) {
          this.stop();
          return null;
        }
        onStatus({ state: 'connected', name: deviceLabel, message: `${deviceLabel} connected` });
        return deviceLabel;
      } catch (err) {
        this.stop();
        if (stopped) return null;
        onStatus({
          state: 'failed',
          message: `Heart rate unavailable (${err?.message || err}) — continuing without it.`,
        });
        return null;
      }
    },
    stop() {
      stopped = true;
      const id = deviceId;
      deviceId = null;
      if (id) {
        ble.stopNotifications({
          deviceId: id,
          service: HEART_RATE_SERVICE_UUID,
          characteristic: HEART_RATE_MEASUREMENT_UUID,
        }).catch(() => {});
        ble.disconnect({ deviceId: id }).catch(() => {});
      }
      notifyListener?.remove?.().catch(() => {});
      notifyListener = null;
    },
  };
}

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
  // On native Android (Capacitor) there is no navigator.bluetooth, so delegate
  // to the plugin-backed monitor. Only when nothing was injected — tests always
  // inject and must keep exercising the web path below.
  if (bluetooth === undefined) {
    const ble = nativeBle();
    if (ble) return createNativeHeartRateMonitor({ ble, onHeartRate, onStatus });
  }

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

  /** Drop the device and everything attached to it; never throws. */
  function release() {
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
  }

  async function subscribe() {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    characteristic.addEventListener('characteristicvaluechanged', handleValueChanged);
    await characteristic.startNotifications();
    // stop() may have landed while the GATT round trips were in flight.
    if (stopped) {
      release();
      throw new Error('stopped');
    }
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
          if (stopped) return;
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
        if (stopped) {
          release();
          return null;
        }
        await subscribe();
        reconnectAttempt = 0;
        onStatus({ state: 'connected', name: deviceName(), message: `${deviceName()} connected` });
        return deviceName();
      } catch (err) {
        release();
        if (stopped) return null;
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
      release();
    },
  };
}
