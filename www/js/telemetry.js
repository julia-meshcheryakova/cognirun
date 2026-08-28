import { clamp, hrZoneFor, targetForStage } from './protocol.js';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHARACTERISTIC = '00002a37-0000-1000-8000-00805f9b34fb';

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalNoise(random) {
  const u = Math.max(1e-9, random());
  const v = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function parseHeartRate(dataView) {
  if (!dataView?.byteLength) return null;
  const flags = dataView.getUint8(0);
  return (flags & 1) ? dataView.getUint16(1, true) : dataView.getUint8(1);
}

function dataViewFromNative(value) {
  if (value && typeof value === 'object' && value.buffer) return value;
  const hex = String(value || '').replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, (index * 2) + 2), 16);
  }
  return new DataView(bytes.buffer);
}

function haversineMetres(a, b) {
  const radius = 6371000;
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);
  const h = (Math.sin(deltaLatitude / 2) ** 2)
    + Math.cos(latitude1) * Math.cos(latitude2) * (Math.sin(deltaLongitude / 2) ** 2);
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === '' || value == null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function normaliseRoxfitSample(input = {}) {
  const payload = input.activity || input.sample || input.data || input;
  const distanceKm = firstNumber(payload.distanceKm, payload.distance_km);
  const paceSecPerKm = firstNumber(payload.paceSecPerKm, payload.pace_sec_per_km);
  const speedMps = firstNumber(payload.speedMps, payload.speed_mps);
  const timestampValue = payload.timestamp || payload.recordedAt || payload.updatedAt || null;
  const parsedTimestamp = typeof timestampValue === 'number' ? timestampValue : Date.parse(timestampValue);
  const sample = {
    activityId: payload.activityId || payload.activity_id || null,
    timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now(),
    hrBpm: firstNumber(payload.hrBpm, payload.heartRateBpm, payload.heart_rate_bpm),
    speedMps: speedMps ?? (paceSecPerKm > 0 ? 1000 / paceSecPerKm : null),
    distanceM: firstNumber(payload.distanceM, payload.distanceMetres, payload.distance_m, payload.distance_meters)
      ?? (distanceKm == null ? null : distanceKm * 1000),
    cadenceSpm: firstNumber(payload.cadenceSpm, payload.cadence_spm),
    paceSecPerKm,
    stage: payload.stage || payload.activityState || payload.activity_state || null,
  };
  sample.valid = ['hrBpm', 'speedMps', 'distanceM', 'cadenceSpm'].some((field) => Number.isFinite(sample[field]));
  return sample;
}

class PartnerRoxfitAdapter {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.configured = false;
    this.connected = false;
    this.latest = null;
    this.timer = null;
    this.polling = false;
    this.lastState = 'idle';
  }

  async initialise() {
    try {
      const configResponse = await fetch('/api/config');
      const config = configResponse.ok ? await configResponse.json() : {};
      this.configured = Boolean(config.roxfitPartnerEndpoint);
      if (!this.configured) return false;
      await this.#poll();
      this.timer = window.setInterval(() => this.#poll(), 1000);
      return this.connected;
    } catch (error) {
      this.#setState('error', `ROXFIT unavailable · ${error.message}`);
      return false;
    }
  }

  get active() {
    return this.connected && this.latest?.valid && Date.now() - this.latest.receivedAt < 10000;
  }

  async #poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const response = await fetch('/api/roxfit/live', { cache: 'no-store' });
      if (!response.ok) throw new Error(`partner API ${response.status}`);
      const sample = normaliseRoxfitSample(await response.json());
      if (!sample.valid) throw new Error('no supported live fields');
      this.latest = { ...sample, receivedAt: Date.now() };
      this.connected = true;
      this.#setState('live', 'ROXFIT activity live');
    } catch (error) {
      this.connected = false;
      this.#setState('error', `ROXFIT unavailable · ${error.message}`);
    } finally {
      this.polling = false;
    }
  }

  #setState(state, message) {
    if (this.lastState === state) return;
    this.lastState = state;
    this.onStatus?.(state, message);
  }

  async stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
  }
}

export class SimulatedRoxfitAdapter {
  constructor(participant, seed = 42) {
    this.participant = participant;
    this.random = mulberry32(seed);
    this.status = 'ready';
    this.stageId = 'seated';
    this.hr = participant.restingHr + 2;
    this.speed = 0;
    this.distanceM = 0;
    this.cadence = 0;
    this.cognitiveLoad = 0;
    this.elapsed = 0;
  }

  setStage(stageId) {
    this.stageId = stageId;
  }

  setCognitiveLoad(level = 0) {
    this.cognitiveLoad = clamp(level, 0, 1);
  }

  target() {
    const { restingHr, reserve } = this.participant;
    const fraction = ({
      seated: 0.02,
      standing: 0.08,
      walking: 0.38,
      zone2: 0.65,
      zone3: 0.75,
      recovery0: 0.32,
      recovery5: 0.16,
    })[this.stageId] ?? 0.1;
    const speed = ({
      seated: 0,
      standing: 0,
      walking: 1.42,
      zone2: 2.75,
      zone3: 3.28,
      recovery0: 0.18,
      recovery5: 0.05,
    })[this.stageId] ?? 0;
    return {
      hr: restingHr + (reserve * fraction),
      speed: speed * (1 - (this.cognitiveLoad * (this.stageId === 'zone3' ? 0.085 : 0.038))),
    };
  }

  sample(deltaSeconds, protocolTime) {
    const delta = clamp(deltaSeconds, 0, 10);
    const target = this.target();
    const recovering = this.stageId.startsWith('recovery');
    const hrTau = recovering ? 55 : 34;
    const hrAlpha = 1 - Math.exp(-delta / hrTau);
    const speedAlpha = 1 - Math.exp(-delta / 5);
    this.hr += hrAlpha * (target.hr - this.hr) + (normalNoise(this.random) * 0.45);
    this.speed += speedAlpha * (target.speed - this.speed) + (normalNoise(this.random) * 0.018);
    this.hr = clamp(this.hr, 42, this.participant.maxHr + 5);
    this.speed = clamp(this.speed, 0, 7);
    this.distanceM += this.speed * delta;
    this.elapsed += delta;
    const moving = this.speed > 0.45;
    this.cadence = moving
      ? clamp(102 + (this.speed * 21) - (this.cognitiveLoad * 3) + normalNoise(this.random), 95, 192)
      : 0;
    const paceSecPerKm = this.speed > 0.2 ? 1000 / this.speed : null;
    return {
      protocolTime,
      wallTime: Date.now(),
      hrBpm: Math.round(this.hr),
      speedMps: Math.round(this.speed * 100) / 100,
      paceSecPerKm: paceSecPerKm ? Math.round(paceSecPerKm) : null,
      distanceM: Math.round(this.distanceM * 10) / 10,
      cadenceSpm: Math.round(this.cadence),
      rpe: ({ seated: 1, standing: 1, walking: 2, zone2: 4, zone3: 7, recovery0: 4, recovery5: 2 })[this.stageId],
      provenance: { hr: 'roxfit-sandbox', speed: 'roxfit-sandbox', distance: 'roxfit-sandbox', cadence: 'roxfit-sandbox' },
      synthetic: true,
    };
  }
}

class BluetoothHeartRateAdapter {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.hr = null;
    this.connected = false;
    this.nativeListener = null;
    this.nativeDeviceId = null;
    this.webDevice = null;
  }

  async connect() {
    this.onStatus?.('connecting', 'Searching for a Garmin HR broadcast…');
    const capacitor = window.Capacitor;
    const isNative = Boolean(capacitor?.isNativePlatform?.());
    if (isNative && capacitor?.Plugins?.BluetoothLe) {
      await this.#connectNative(capacitor.Plugins.BluetoothLe);
      return;
    }
    if (navigator.bluetooth) {
      await this.#connectWeb();
      return;
    }
    throw new Error('Bluetooth heart-rate access is unavailable in this browser.');
  }

  async #connectNative(ble) {
    await ble.initialize({ androidNeverForLocation: true });
    const device = await new Promise(async (resolve, reject) => {
      let settled = false;
      const listener = await ble.addListener('onScanResult', async (result) => {
        if (settled || !result?.device) return;
        settled = true;
        clearTimeout(timeout);
        await ble.stopLEScan().catch(() => {});
        await listener.remove().catch(() => {});
        resolve(result.device);
      });
      const timeout = window.setTimeout(async () => {
        if (settled) return;
        settled = true;
        await ble.stopLEScan().catch(() => {});
        await listener.remove().catch(() => {});
        reject(new Error('No HR broadcaster found in 15 seconds. Enable Broadcast HR on the watch.'));
      }, 15000);
      await ble.requestLEScan({ services: [HR_SERVICE] });
    });
    await ble.connect({ deviceId: device.deviceId });
    this.nativeDeviceId = device.deviceId;
    const notificationKey = `notification|${device.deviceId}|${HR_SERVICE}|${HR_CHARACTERISTIC}`;
    this.nativeListener = await ble.addListener(notificationKey, (result) => {
      const parsed = parseHeartRate(dataViewFromNative(result?.value));
      if (parsed) this.hr = parsed;
    });
    await ble.startNotifications({
      deviceId: device.deviceId,
      service: HR_SERVICE,
      characteristic: HR_CHARACTERISTIC,
    });
    this.connected = true;
    this.onStatus?.('live', `${device.name || 'Garmin'} HR live`);
  }

  async #connectWeb() {
    this.webDevice = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    const server = await this.webDevice.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const parsed = parseHeartRate(event.target.value);
      if (parsed) this.hr = parsed;
    });
    this.connected = true;
    this.onStatus?.('live', `${this.webDevice.name || 'Garmin'} HR live`);
  }

  async stop() {
    const ble = window.Capacitor?.Plugins?.BluetoothLe;
    if (ble && this.nativeDeviceId) {
      await ble.stopNotifications({
        deviceId: this.nativeDeviceId,
        service: HR_SERVICE,
        characteristic: HR_CHARACTERISTIC,
      }).catch(() => {});
      await ble.disconnect({ deviceId: this.nativeDeviceId }).catch(() => {});
      await this.nativeListener?.remove?.().catch(() => {});
    }
    if (this.webDevice?.gatt?.connected) this.webDevice.gatt.disconnect();
    this.connected = false;
    this.hr = null;
  }
}

class GpsAdapter {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.watchId = null;
    this.points = [];
    this.distanceM = 0;
    this.speedMps = null;
    this.connected = false;
  }

  async connect() {
    this.onStatus?.('connecting', 'Requesting location…');
    const capacitor = window.Capacitor;
    const isNative = Boolean(capacitor?.isNativePlatform?.());
    if (isNative && capacitor?.Plugins?.Geolocation) {
      const geo = capacitor.Plugins.Geolocation;
      await geo.requestPermissions();
      this.watchId = await geo.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, (position) => {
        if (position) this.#acceptPosition(position.coords, position.timestamp);
      });
    } else if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.#acceptPosition(position.coords, position.timestamp),
        (error) => this.onStatus?.('error', error.message),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    } else {
      throw new Error('GPS is unavailable on this device.');
    }
    this.connected = true;
    this.onStatus?.('live', 'Phone GPS live');
  }

  #acceptPosition(coords, timestamp) {
    const point = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      timestamp: timestamp || Date.now(),
    };
    const previous = this.points.at(-1);
    if (previous && point.accuracy < 40) {
      const step = haversineMetres(previous, point);
      if (step < 80) this.distanceM += step;
      const delta = (point.timestamp - previous.timestamp) / 1000;
      this.speedMps = Number.isFinite(point.speed) && point.speed >= 0
        ? point.speed
        : (delta > 0 ? step / delta : this.speedMps);
    }
    this.points.push(point);
    if (this.points.length > 2000) this.points.shift();
  }

  async stop() {
    const capacitor = window.Capacitor;
    if (this.watchId == null) return;
    if (capacitor?.isNativePlatform?.() && capacitor?.Plugins?.Geolocation) {
      await capacitor.Plugins.Geolocation.clearWatch({ id: this.watchId }).catch(() => {});
    } else if (navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.connected = false;
  }
}

export class TelemetryHub {
  constructor({ participant, seed, mode = 'simulation', onStatus } = {}) {
    this.participant = participant;
    this.mode = mode;
    this.onStatus = onStatus;
    this.simulator = new SimulatedRoxfitAdapter(participant, seed);
    this.partner = new PartnerRoxfitAdapter((state, message) => this.onStatus?.('roxfit', state, message));
    this.bluetooth = new BluetoothHeartRateAdapter((state, message) => this.onStatus?.('hr', state, message));
    this.gps = new GpsAdapter((state, message) => this.onStatus?.('gps', state, message));
    this.lastSample = null;
    this.stageId = 'seated';
  }

  async initialise() {
    return this.partner.initialise();
  }

  setStage(stageId) {
    this.stageId = stageId;
    this.simulator.setStage(stageId);
  }

  setCognitiveLoad(level) {
    this.simulator.setCognitiveLoad(level);
  }

  async connectHeartRate() {
    return this.bluetooth.connect();
  }

  async connectGps() {
    return this.gps.connect();
  }

  sample(deltaSeconds, protocolTime) {
    const simulated = this.simulator.sample(deltaSeconds, protocolTime);
    const partner = this.partner.active ? this.partner.latest : null;
    const useRoxfitHr = Number.isFinite(partner?.hrBpm);
    const useRoxfitSpeed = Number.isFinite(partner?.speedMps);
    const useRoxfitDistance = Number.isFinite(partner?.distanceM);
    const useRoxfitCadence = Number.isFinite(partner?.cadenceSpm);
    const useLiveHr = !useRoxfitHr && this.bluetooth.connected && Number.isFinite(this.bluetooth.hr);
    const useLiveGps = !useRoxfitSpeed && this.gps.connected && Number.isFinite(this.gps.speedMps);
    const sample = {
      ...simulated,
      hrBpm: useRoxfitHr ? partner.hrBpm : (useLiveHr ? this.bluetooth.hr : simulated.hrBpm),
      speedMps: useRoxfitSpeed ? partner.speedMps : (useLiveGps ? this.gps.speedMps : simulated.speedMps),
      distanceM: useRoxfitDistance ? partner.distanceM : (useLiveGps ? this.gps.distanceM : simulated.distanceM),
      cadenceSpm: useRoxfitCadence ? partner.cadenceSpm : simulated.cadenceSpm,
      synthetic: !(partner?.valid || useLiveHr || useLiveGps),
      provenance: {
        ...simulated.provenance,
        hr: useRoxfitHr ? 'roxfit-live' : (useLiveHr ? 'garmin-ble' : simulated.provenance.hr),
        speed: useRoxfitSpeed ? 'roxfit-live' : (useLiveGps ? 'phone-gps' : simulated.provenance.speed),
        distance: useRoxfitDistance ? 'roxfit-live' : (useLiveGps ? 'phone-gps' : simulated.provenance.distance),
        cadence: useRoxfitCadence ? 'roxfit-live' : simulated.provenance.cadence,
      },
    };
    sample.paceSecPerKm = sample.speedMps > 0.2 ? Math.round(1000 / sample.speedMps) : null;
    sample.zone = hrZoneFor(sample.hrBpm, this.participant);
    sample.targetHr = targetForStage(this.stageId, this.participant);
    sample.onTarget = sample.targetHr
      ? sample.hrBpm >= sample.targetHr[0] && sample.hrBpm <= sample.targetHr[1]
      : true;
    this.lastSample = sample;
    return sample;
  }

  status() {
    if (this.partner.active) return 'ROXFIT live';
    const liveFields = [];
    if (this.bluetooth.connected) liveFields.push('Garmin HR');
    if (this.gps.connected) liveFields.push('phone GPS');
    if (liveFields.length) return liveFields.join(' + ');
    return this.partner.configured ? 'ROXFIT fallback · sandbox' : 'ROXFIT sandbox';
  }

  async stop() {
    await Promise.allSettled([this.partner.stop(), this.bluetooth.stop(), this.gps.stop()]);
  }
}

export function formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0 || secondsPerKm > 1800) return '—';
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
