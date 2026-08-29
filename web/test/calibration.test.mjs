import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALIBRATION_CONDITIONS,
  CALIBRATION_CONDITION_IDS,
  calibrationCondition,
  calibrationConditionOrder,
  calibrationDurationSec,
  isFinalCalibrationCondition,
  nextCalibrationCondition,
} from '../src/calibration.js';

test('the protocol is the five demo conditions, in order, with unique ids', () => {
  assert.deepEqual(CALIBRATION_CONDITION_IDS, [
    'seated',
    'walking',
    'running',
    'recovery-immediate',
    'recovery-5min',
  ]);
  assert.equal(new Set(CALIBRATION_CONDITION_IDS).size, CALIBRATION_CONDITIONS.length);
});

test('every condition carries a label, an instruction and positive hold time', () => {
  CALIBRATION_CONDITIONS.forEach((condition) => {
    assert.ok(condition.label, `${condition.id} needs a label`);
    assert.ok(condition.instruction, `${condition.id} needs an instruction`);
    assert.ok(condition.holdSec > 0, `${condition.id} holdSec`);
    assert.ok(condition.restSec >= 0, `${condition.id} restSec`);
  });

  const labels = CALIBRATION_CONDITIONS.map((c) => c.label);
  assert.equal(new Set(labels).size, labels.length, 'labels must be unique');
});

test('only the five-minute recovery waits before it starts', () => {
  const resting = CALIBRATION_CONDITIONS.filter((c) => c.restSec > 0).map((c) => c.id);
  assert.deepEqual(resting, ['recovery-5min']);

  const fiveMin = calibrationCondition('recovery-5min');
  const immediate = calibrationCondition('recovery-immediate');
  assert.equal(
    immediate.holdSec + fiveMin.restSec,
    300,
    'the final reading is 5 minutes after the run stops',
  );
});

test('lookup by id returns the condition and rejects unknown ids', () => {
  assert.equal(calibrationCondition('walking').label, 'Walking');
  assert.throws(() => calibrationCondition('sleeping'), /unknown calibration condition sleeping/);
  assert.throws(() => calibrationConditionOrder('sleeping'), /unknown calibration condition/);
});

test('order and transitions follow the declared sequence', () => {
  CALIBRATION_CONDITION_IDS.forEach((id, index) => {
    assert.equal(calibrationConditionOrder(id), index);
  });

  assert.equal(nextCalibrationCondition('seated').id, 'walking');
  assert.equal(nextCalibrationCondition('recovery-immediate').id, 'recovery-5min');
  assert.equal(nextCalibrationCondition('recovery-5min'), null);

  assert.equal(isFinalCalibrationCondition('recovery-5min'), true);
  assert.equal(isFinalCalibrationCondition('running'), false);
});

test('total protocol duration sums holds and rests', () => {
  assert.equal(calibrationDurationSec(), 60 + 60 + 120 + 60 + 240 + 60);
});
