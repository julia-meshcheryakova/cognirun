import assert from 'node:assert/strict';
import test from 'node:test';

import { QUESTION_COUNT, RUN_DISTANCE_METERS, createRun } from '../src/run.js';

const START = { lat: 52.3702, lng: 4.8952 };
const METERS_PER_DEG_LAT = 111_320;

/** Stand-in for navigator.geolocation: fixes are pushed by the test, not by a device. */
function mockGeolocation() {
  const watchers = [];
  const geolocation = {
    permissionCalls: 0,
    permissionError: null,
    cleared: [],
    watchPosition(onFix, onError) {
      watchers.push({ onFix, onError });
      return watchers.length;
    },
    clearWatch(id) {
      geolocation.cleared.push(id);
    },
    getCurrentPosition(onFix, onError) {
      geolocation.permissionCalls += 1;
      if (geolocation.permissionError) onError(geolocation.permissionError);
      else onFix(fix({ metersNorth: 0 }));
    },
    /** Straight run north from START, one fix every `seconds`. */
    move({ metersNorth, seconds = 5, accuracy = 5 }) {
      watchers.forEach((w) => w.onFix(fix({ metersNorth, seconds, accuracy })));
    },
    fail(code, message = 'nope') {
      watchers.forEach((w) => w.onError({ code, message }));
    },
  };
  return geolocation;
}

let elapsedSeconds = 0;
function fix({ metersNorth, seconds = 0, accuracy = 5 }) {
  elapsedSeconds += seconds;
  return {
    coords: {
      latitude: START.lat + metersNorth / METERS_PER_DEG_LAT,
      longitude: START.lng,
      accuracy,
    },
    timestamp: 1_700_000_000_000 + elapsedSeconds * 1000,
  };
}

function realRun(geolocation) {
  const kilometers = [];
  const statuses = [];
  let finish = null;
  const run = createRun({
    demo: false,
    multiplier: 1,
    geolocation,
    onUpdate() {},
    onKilometer(km) {
      kilometers.push(km);
      run.noteAnswered(); // the UI answers the question; here it is instant
    },
    onFinish(snapshot) {
      finish = snapshot;
    },
    onError() {},
    onGpsStatus(status) {
      statuses.push(status);
    },
  });
  run.start();
  return { run, kilometers, statuses, finish: () => finish };
}

test('real GPS fixes accumulate distance, fire kilometers and finish the run', () => {
  const geolocation = mockGeolocation();
  const { run, kilometers, finish } = realRun(geolocation);

  for (let meters = 20; meters <= RUN_DISTANCE_METERS + 200; meters += 20) {
    geolocation.move({ metersNorth: meters });
  }

  assert.ok(run.snapshot().distance >= RUN_DISTANCE_METERS, `distance ${run.snapshot().distance}`);
  assert.deepEqual(kilometers, [1, 2, 3]);
  assert.equal(kilometers.length, QUESTION_COUNT);
  assert.ok(run.snapshot().speed > 3 && run.snapshot().speed < 5, `speed ${run.snapshot().speed}`);
  assert.ok(finish(), 'run finishes at 3 km with every question answered');
  assert.deepEqual(geolocation.cleared, [1], 'the watch is released when the run stops');
  run.stop();
});

test('stationary jitter and weak fixes do not add distance', () => {
  const geolocation = mockGeolocation();
  const { run, statuses } = realRun(geolocation);

  geolocation.move({ metersNorth: 0 });
  geolocation.move({ metersNorth: 1.5 }); // inside the accuracy/2 jitter band
  geolocation.move({ metersNorth: 2.2 });
  assert.equal(run.snapshot().distance, 0);

  geolocation.move({ metersNorth: 500, accuracy: 120 }); // a wifi-grade "fix"
  assert.equal(run.snapshot().distance, 0);
  assert.ok(
    statuses.some((s) => s.state === 'weak'),
    'a weak fix is reported instead of silently freezing',
  );

  geolocation.move({ metersNorth: 30 });
  assert.ok(run.snapshot().distance > 25, `real movement counts: ${run.snapshot().distance}`);
  run.stop();
});

test('denied permission is reported, from the start gesture and from the watch', async () => {
  const geolocation = mockGeolocation();
  geolocation.permissionError = { code: 1, message: 'User denied Geolocation' };
  const { run, statuses } = realRun(geolocation);

  await run.sensors.requestPermission();
  geolocation.fail(1);

  assert.equal(geolocation.permissionCalls, 1);
  assert.equal(statuses.filter((s) => s.state === 'denied').length, 2);
  assert.equal(run.snapshot().distance, 0);
  run.stop();
});

test('a missing geolocation API fails loudly instead of freezing at 0', () => {
  const errors = [];
  const statuses = [];
  const run = createRun({
    demo: false,
    multiplier: 1,
    geolocation: undefined,
    onUpdate() {},
    onKilometer() {},
    onFinish() {},
    onError(message) {
      errors.push(message);
    },
    onGpsStatus(status) {
      statuses.push(status);
    },
  });

  run.start();
  assert.equal(errors.length, 1);
  assert.deepEqual(
    statuses.map((s) => s.state),
    ['unavailable'],
  );
  run.stop();
});
