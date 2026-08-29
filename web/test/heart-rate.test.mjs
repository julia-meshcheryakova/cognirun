import assert from 'node:assert/strict';
import test from 'node:test';

import { createHeartRateMonitor, parseHeartRate } from '../src/sensors/heartRate.js';
import { createRun } from '../src/run.js';

/** Minimal stand-in for the BLE stack: one HR service with a notifying 0x2A37. */
function fakeBluetooth({ name = 'Forerunner 265', failOn } = {}) {
  const listeners = new Map();
  const characteristic = {
    listeners: [],
    notifying: false,
    addEventListener(type, fn) {
      if (type === 'characteristicvaluechanged') this.listeners.push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners = this.listeners.filter((l) => l !== fn);
    },
    async startNotifications() {
      this.notifying = true;
    },
    async stopNotifications() {
      this.notifying = false;
    },
    /** Push a Heart Rate Measurement packet (8-bit value, flags = 0). */
    notify(bpm) {
      const value = new DataView(new Uint8Array([0x00, bpm]).buffer);
      this.listeners.forEach((fn) => fn({ target: { value } }));
    },
  };

  const device = {
    name,
    gatt: {
      connected: false,
      async connect() {
        if (failOn === 'connect') throw new Error('GATT unreachable');
        this.connected = true;
        return {
          async getPrimaryService() {
            if (failOn === 'service') throw new Error('service not found');
            return { async getCharacteristic() { return characteristic; } };
          },
        };
      },
      disconnect() {
        this.connected = false;
      },
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    /** Simulate the watch going out of range mid-run. */
    dropConnection() {
      this.gatt.connected = false;
      listeners.get('gattserverdisconnected')?.();
    },
  };

  return {
    device,
    characteristic,
    bluetooth: {
      async requestDevice() {
        if (failOn === 'requestDevice') throw new Error('User cancelled the requestDevice() chooser.');
        return device;
      },
    },
  };
}

test('parses both 8-bit and 16-bit heart rate measurements', () => {
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x00, 142]).buffer)), 142);
  assert.equal(parseHeartRate(new DataView(new Uint8Array([0x01, 0x8e, 0x00]).buffer)), 142);
});

test('notified heart rate flows into a real run', async () => {
  const ble = fakeBluetooth();
  const updates = [];
  const run = createRun({
    demo: false,
    multiplier: 1,
    onUpdate: (snapshot) => updates.push(snapshot.heartRate),
    onKilometer() {},
    onFinish() {},
    onError() {},
    onHeartRateStatus() {},
    bluetooth: ble.bluetooth,
  });

  assert.equal(await run.sensors.connectHeartRate(), 'Forerunner 265');
  assert.ok(ble.characteristic.notifying, 'should subscribe to 0x2A37 notifications');

  ble.characteristic.notify(138);
  ble.characteristic.notify(151);

  assert.deepEqual(updates, [138, 151]);
  assert.equal(run.snapshot().heartRate, 151);

  run.stop();
  assert.equal(ble.characteristic.notifying, false, 'stopping the run unsubscribes');
});

test('a cancelled chooser reports a status and leaves the run usable', async () => {
  const ble = fakeBluetooth({ failOn: 'requestDevice' });
  const statuses = [];
  const monitor = createHeartRateMonitor({
    onHeartRate: () => assert.fail('no heart rate without a device'),
    onStatus: (status) => statuses.push(status),
    bluetooth: ble.bluetooth,
  });

  assert.equal(await monitor.connect(), null);
  assert.deepEqual(
    statuses.map((s) => s.state),
    ['connecting', 'failed'],
  );
  monitor.stop();
});

test('no Web Bluetooth at all is reported, not thrown', async () => {
  const statuses = [];
  const monitor = createHeartRateMonitor({
    onHeartRate() {},
    onStatus: (status) => statuses.push(status),
    bluetooth: null,
  });

  assert.equal(await monitor.connect(), null);
  assert.equal(statuses[0].state, 'unavailable');
});

test('a mid-run disconnect reconnects and keeps streaming', async () => {
  const ble = fakeBluetooth();
  const beats = [];
  const statuses = [];
  const monitor = createHeartRateMonitor({
    onHeartRate: (bpm) => beats.push(bpm),
    onStatus: (status) => statuses.push(status),
    bluetooth: ble.bluetooth,
  });

  await monitor.connect();
  ble.characteristic.notify(120);
  ble.device.dropConnection();

  assert.ok(
    statuses.some((s) => s.state === 'reconnecting'),
    'disconnect should be surfaced',
  );

  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(statuses.at(-1).state, 'connected');

  ble.characteristic.notify(133);
  assert.deepEqual(beats, [120, 133]);
  monitor.stop();
});

test('demo runs never touch Bluetooth', () => {
  const run = createRun({
    demo: true,
    multiplier: 1,
    onUpdate() {},
    onKilometer() {},
    onFinish() {},
    onError() {},
    bluetooth: {
      requestDevice: () => assert.fail('demo mode must not request a BLE device'),
    },
  });

  assert.equal(run.sensors.connectHeartRate, undefined);
  run.start();
  run.stop();
  assert.ok(run.snapshot().heartRate >= 0);
});
