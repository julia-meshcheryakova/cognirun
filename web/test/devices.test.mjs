import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevices } from '../src/sensors/devices.js';
import { setupMarkup } from '../src/ui/setup.js';

const demo = { demo: true, multiplier: 10, voice: true };
const live = { demo: false, multiplier: 10, voice: true };

/** Geolocation stand-in: `fix`/`fail` push what watchPosition would deliver. */
function fakeGeolocation() {
  let handlers = null;
  return {
    cleared: [],
    watchPosition(onPosition, onError) {
      handlers = { onPosition, onError };
      return 7;
    },
    clearWatch(id) {
      this.cleared.push(id);
      handlers = null;
    },
    fix({ lat = 52.37, lng = 4.9, accuracy = 5, t = 1000 } = {}) {
      handlers.onPosition({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: t });
    },
    fail(message) {
      handlers.onError({ message });
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

test('connected GPS replaces its button with the tracking status', () => {
  const markup = setupMarkup({
    settings: live,
    devices: { heartRate: { state: 'idle' }, gps: { state: 'connected', accuracy: 5 } },
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
  assert.deepEqual(states, ['connecting']);

  const points = [];
  devices.attach({ onPosition: (p) => points.push(p), onHeartRate() {}, onHeartRateStatus() {} });
  geolocation.fix({ t: 1234 });

  assert.equal(devices.state().gps.state, 'connected');
  assert.deepEqual(points, [{ lat: 52.37, lng: 4.9, accuracy: 5, t: 1234 }]);

  devices.stop();
  assert.deepEqual(geolocation.cleared, [7]);
  assert.equal(devices.state().gps.state, 'idle');
});

test('a denied location permission is reported, not thrown', () => {
  const geolocation = fakeGeolocation();
  const devices = createDevices({ geolocation });

  devices.connectGps();
  geolocation.fail('User denied Geolocation');

  assert.equal(devices.state().gps.state, 'failed');
  assert.match(setupMarkup({ settings: live, devices: devices.state() }), /User denied Geolocation/);
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
