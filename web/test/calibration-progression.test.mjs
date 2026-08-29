import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALIBRATION_CONDITIONS,
  CALIBRATION_CONDITION_IDS,
  calibrationDurationSec,
} from '../src/calibration.js';
import { createCalibrationSession } from '../src/calibrationSession.js';

/** Runs the whole protocol one simulated second at a time. */
function playProtocol() {
  const visited = [];
  const phases = [];
  let completed = null;
  let ticks = 0;

  const session = createCalibrationSession({
    onCondition(state) {
      visited.push(state.condition.id);
    },
    onUpdate(state) {
      phases.push(`${state.condition.id}:${state.phase}`);
    },
    onComplete(state) {
      completed = state;
    },
  });

  while (!session.state().done && ticks < 10_000) {
    session.tick();
    ticks += 1;
  }

  return { session, visited, phases, completed, ticks };
}

test('the session starts on the first condition, holding', () => {
  const state = createCalibrationSession().state();
  assert.equal(state.condition.id, 'seated');
  assert.equal(state.index, 0);
  assert.equal(state.total, CALIBRATION_CONDITIONS.length);
  assert.equal(state.phase, 'hold');
  assert.equal(state.remainingSec, 60);
  assert.deepEqual(state.completedIds, []);
  assert.equal(state.done, false);
});

test('ticking counts the current hold down without leaving the condition', () => {
  const session = createCalibrationSession();
  for (let i = 0; i < 59; i += 1) session.tick();
  const state = session.state();
  assert.equal(state.condition.id, 'seated');
  assert.equal(state.remainingSec, 1);
  assert.equal(state.elapsedSec, 59);
});

test('a finished hold advances to the next condition', () => {
  const session = createCalibrationSession();
  for (let i = 0; i < 60; i += 1) session.tick();
  const state = session.state();
  assert.equal(state.condition.id, 'walking');
  assert.equal(state.phase, 'hold');
  assert.equal(state.remainingSec, 60);
  assert.deepEqual(state.completedIds, ['seated']);
});

test('the five-minute recovery rests before it starts holding', () => {
  const session = createCalibrationSession();
  const untilFinal = 60 + 60 + 120 + 60; // seated, walking, running, immediate recovery
  for (let i = 0; i < untilFinal; i += 1) session.tick();

  let state = session.state();
  assert.equal(state.condition.id, 'recovery-5min');
  assert.equal(state.phase, 'rest');
  assert.equal(state.remainingSec, 240);

  for (let i = 0; i < 240; i += 1) session.tick();
  state = session.state();
  assert.equal(state.phase, 'hold');
  assert.equal(state.remainingSec, 60);
  assert.equal(state.done, false);
});

test('the protocol visits every condition in order and completes on the last one', () => {
  const { visited, completed, ticks, session } = playProtocol();

  assert.deepEqual(visited, CALIBRATION_CONDITION_IDS);
  assert.equal(ticks, calibrationDurationSec());
  assert.ok(completed, 'onComplete fires');
  assert.deepEqual(completed.completedIds, CALIBRATION_CONDITION_IDS);
  assert.equal(session.state().done, true);
  assert.equal(session.state().remainingSec, 0);
});

test('only the final condition reports a resting phase', () => {
  const { phases } = playProtocol();
  const resting = [...new Set(phases.filter((p) => p.endsWith(':rest')))];
  assert.deepEqual(resting, ['recovery-5min:rest']);
});

test('ticking past the end is a no-op and does not re-complete', () => {
  let completions = 0;
  const session = createCalibrationSession({
    onComplete() {
      completions += 1;
    },
  });
  for (let i = 0; i < calibrationDurationSec() + 50; i += 1) session.tick();

  assert.equal(completions, 1);
  assert.equal(session.state().done, true);
  assert.equal(session.state().condition.id, 'recovery-5min');
});

test('skip jumps to the next condition and finishes the protocol from the last', () => {
  const visited = [];
  let completed = false;
  const session = createCalibrationSession({
    onCondition(state) {
      visited.push(state.condition.id);
    },
    onComplete() {
      completed = true;
    },
  });

  session.tick();
  session.skip();
  assert.equal(session.state().condition.id, 'walking');
  assert.equal(session.state().elapsedSec, 0);
  assert.deepEqual(session.state().completedIds, ['seated']);

  CALIBRATION_CONDITION_IDS.slice(1).forEach(() => session.skip());
  assert.deepEqual(visited, CALIBRATION_CONDITION_IDS);
  assert.equal(completed, true);
  assert.equal(session.state().done, true);

  session.skip();
  assert.equal(session.state().done, true);
});

test('finish ends the protocol immediately and marks every condition done', () => {
  const session = createCalibrationSession();
  session.tick();
  session.finish();
  assert.equal(session.state().done, true);
  assert.deepEqual(session.state().completedIds, CALIBRATION_CONDITION_IDS);
});
