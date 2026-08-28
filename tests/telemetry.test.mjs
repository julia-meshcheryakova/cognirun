import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedRoxfitAdapter, normaliseRoxfitSample } from '../www/js/telemetry.js';
import { computeHeartRateProfile } from '../www/js/protocol.js';

const participant = computeHeartRateProfile({ age: 28, restingHr: 62, maxHr: 190 });

test('ROXFIT sandbox telemetry is deterministic for the same seed', () => {
  const first = new SimulatedRoxfitAdapter(participant, 99);
  const second = new SimulatedRoxfitAdapter(participant, 99);
  first.setStage('zone2');
  second.setStage('zone2');
  const a = Array.from({ length: 40 }, (_, index) => first.sample(1, index));
  const b = Array.from({ length: 40 }, (_, index) => second.sample(1, index));
  assert.deepEqual(a.map((sample) => [sample.hrBpm, sample.speedMps]), b.map((sample) => [sample.hrBpm, sample.speedMps]));
});

test('cognitive load produces a measurable running-speed cost', () => {
  const adapter = new SimulatedRoxfitAdapter(participant, 12);
  adapter.setStage('zone3');
  for (let index = 0; index < 180; index += 1) adapter.sample(1, index);
  const before = adapter.speed;
  adapter.setCognitiveLoad(1);
  for (let index = 0; index < 20; index += 1) adapter.sample(1, 180 + index);
  assert.ok(adapter.speed < before);
  assert.ok(adapter.distanceM > 0);
});

test('ROXFIT partner payloads normalise only unit-labelled fields', () => {
  const sample = normaliseRoxfitSample({
    data: { heart_rate_bpm: 142, pace_sec_per_km: 300, distanceKm: 1.25, cadence_spm: 168 },
  });
  assert.equal(sample.hrBpm, 142);
  assert.equal(sample.speedMps, 1000 / 300);
  assert.equal(sample.distanceM, 1250);
  assert.equal(sample.cadenceSpm, 168);
  assert.equal(sample.valid, true);
});
