import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevices } from '../src/sensors/devices.js';
import { createRun } from '../src/run.js';
import { setupMarkup } from '../src/ui/setup.js';

const demo = { demo: true, multiplier: 10, voice: true };
const live = { demo: false, multiplier: 10, voice: true };

/** Geolocation stand-in: `fix`/`fail` push what watchPosition would deliver. */
function fakeGeolocation() {
  let handlers = null;
  let nextId = 7;
  return {
    cleared: [],
    watchPosition(onPosition, onError) {
      handlers = { onPosition, onError };
      return nextId++;
    },
    clearWatch(id) {
      this.cleared.push(id);
      handlers = null;
    },
    fix({ lat = 52.37, lng = 4.9, accuracy = 5, t = 1000 } = {}) {
      handlers.onPosition({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: t });
    },
    fail(error) {
      handlers.onError(error);
    },
  };
}

test('both device panels are always on the setup screen', () => {
  [demo, live].forEach((settings) => {
    const markup = setupMarkup({ settings });
    assert.match(markup, /id="connect-watch"/);
    assert.match(markup, /id="connect-gps"/);
  });
});

test('a connected watch replaces its button with the live heart rate', () => {
  const markup = setupMarkup({
    settings: live,
    devices: {
      heartRate: { state: 'connected', name: 'Forerunner 265', bpm: 72 },
      gps: { state: 'idle' },
    },
  });
  assert.match(markup, /❤️ 72 bpm/);
  assert.doesNotMatch(markup, /id="connect-watch"/);
  assert.match(markup, /id="connect-gps"/);
});

test('tracking GPS replaces its button with the tracking status', () => {
  const markup = setupMarkup({
    settings: live,
    devices: { heartRate: { state: 'idle' }, gps: { state: 'live', message: 'GPS ±5 m' } },
  });
  assert.match(markup, /📍 GPS on/);
  assert.doesNotMatch(markup, /id="connect-gps"/);
});

test('connecting GPS tracks position and reports the state', () => {
  const geolocation = fakeGeolocation();
  const states = [];
  const devices = createDevices({ geolocation, onChange: (s) => states.push(s.gps.state) });

  assert.equal(devices.state().gps.state, 'idle');
  devices.connectGps();
  assert.deepEqual(states, ['waiting']);

  const points = [];
  devices.attach({ onPosition: (p) => points.push(p), onHeartRate() {}, onHeartRateStatus() {} });
  geolocation.fix({ t: 1234 });

  assert.equal(devices.state().gps.state, 'live');
  assert.deepEqual(points, [{ lat: 52.37, lng: 4.9, accuracy: 5, t: 1234 }]);

  devices.stop();
  assert.deepEqual(geolocation.cleared, [7]);
  assert.equal(devices.state().gps.state, 'idle');
});

test('a denied location permission is reported and can be retried', () => {
  const geolocation = fakeGeolocation();
  const devices = createDevices({ geolocation });

  devices.connectGps();
  geolocation.fail({ code: 1, message: 'User denied Geolocation' });

  assert.equal(devices.state().gps.state, 'denied');
  const markup = setupMarkup({ settings: live, devices: devices.state() });
  assert.match(markup, /Location permission denied/);
  assert.match(markup, /id="connect-gps"/); // the button is back so the user can retry

  devices.connectGps();
  geolocation.fix({ t: 99 });
  assert.equal(devices.state().gps.state, 'live');
  devices.stop();
});

test('a device message is escaped instead of rendered as markup', () => {
  const markup = setupMarkup({
    settings: live,
    devices: {
      heartRate: { state: 'idle' },
      gps: { state: 'failed', message: '<img src=x onerror=alert(1)>' },
    },
  });
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;img/);
});

test('GPS fixes before the run starts do not add distance', () => {
  const geolocation = fakeGeolocation();
  const devices = createDevices({ geolocation });
  devices.connectGps();

  const updates = [];
  const run = createRun({
    demo: false,
    multiplier: 1,
    devices,
    onUpdate: (s) => updates.push(s.distance),
    onKilometer() {},
    onFinish() {},
    onError() {},
  });

  geolocation.fix({ lat: 52.37, lng: 4.9, t: 1000 });
  geolocation.fix({ lat: 52.38, lng: 4.9, t: 2000 });
  assert.deepEqual(updates, []);

  run.start();
  geolocation.fix({ lat: 52.39, lng: 4.9, t: 3000 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0], 0); // first fix in the run is only the starting point
  run.stop();
});

test('no geolocation at all is reported, not thrown', () => {
  const devices = createDevices({ geolocation: undefined });
  devices.connectGps();
  assert.equal(devices.state().gps.state, 'unavailable');
});

test('heart rate connected on the setup screen streams into the run', async () => {
  const characteristic = {
    listeners: [],
    addEventListener(type, fn) {
      if (type === 'characteristicvaluechanged') this.listeners.push(fn);
    },
    removeEventListener() {},
    async startNotifications() {},
    async stopNotifications() {},
    notify(bpm) {
      const value = new DataView(new Uint8Array([0x00, bpm]).buffer);
      this.listeners.forEach((fn) => fn({ target: { value } }));
    },
  };
  const bluetooth = {
    async requestDevice() {
      return {
        name: 'Forerunner 265',
        gatt: {
          connected: false,
          async connect() {
            this.connected = true;
            return {
              async getPrimaryService() {
                return { getCharacteristic: async () => characteristic };
              },
            };
          },
          disconnect() {
            this.connected = false;
          },
        },
        addEventListener() {},
        removeEventListener() {},
      };
    },
  };

  const devices = createDevices({ bluetooth, geolocation: fakeGeolocation() });
  assert.equal(await devices.connectHeartRate(), 'Forerunner 265');

  characteristic.notify(72);
  assert.equal(devices.state().heartRate.state, 'connected');
  assert.equal(devices.state().heartRate.bpm, 72);
  assert.match(setupMarkup({ settings: live, devices: devices.state() }), /❤️ 72 bpm/);

  const beats = [];
  devices.attach({ onPosition() {}, onHeartRate: (bpm) => beats.push(bpm), onHeartRateStatus() {} });
  characteristic.notify(81);
  assert.deepEqual(beats, [81]);

  devices.stop();
});
