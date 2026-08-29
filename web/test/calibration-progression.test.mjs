import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALIBRATION_CONDITIONS,
  CALIBRATION_CONDITION_IDS,
  calibrationCondition,
  calibrationDurationSec,
} from '../src/calibration.js';
import { createCalibrationSession } from '../src/calibrationSession.js';
import { calibrationMarkup } from '../src/ui/calibration.js';

/** Runs the whole protocol one simulated second at a time. */
function playProtocol() {
  const stages = [];
  const phases = [];
  let completed = null;
  let ticks = 0;

  const session = createCalibrationSession({
    onStage(state) {
      stages.push(state.condition.id);
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

  return { session, stages, phases, completed, ticks };
}

test('the session starts on the first stage, holding', () => {
  const state = createCalibrationSession().state();
  assert.equal(state.condition.id, 'seated');
  assert.equal(state.index, 0);
  assert.equal(state.total, 7);
  assert.equal(state.phase, 'hold');
  assert.equal(state.remainingSec, 60);
  assert.deepEqual(state.completedIds, []);
  assert.equal(state.done, false);
});

test('ticking counts the current hold down without leaving the stage', () => {
  const session = createCalibrationSession();
  for (let i = 0; i < 59; i += 1) session.tick();
  const state = session.state();
  assert.equal(state.condition.id, 'seated');
  assert.equal(state.remainingSec, 1);
  assert.equal(state.elapsedSec, 59);
});

test('a finished hold advances to the next stage', () => {
  const session = createCalibrationSession();
  for (let i = 0; i < 60; i += 1) session.tick();
  const state = session.state();
  assert.equal(state.condition.id, 'standing');
  assert.equal(state.phase, 'hold');
  assert.equal(state.remainingSec, 60);
  assert.deepEqual(state.completedIds, ['seated']);
});

test('the zone stages follow walking and are held for two minutes each', () => {
  const session = createCalibrationSession();
  for (let i = 0; i < 60 + 60 + 60; i += 1) session.tick(); // seated, standing, walking

  let state = session.state();
  assert.equal(state.condition.id, 'zone2');
  assert.equal(state.remainingSec, 120);

  for (let i = 0; i < 120; i += 1) session.tick();
  state = session.state();
  assert.equal(state.condition.id, 'zone3');
  assert.equal(state.remainingSec, 120);
  assert.deepEqual(state.completedIds, ['seated', 'standing', 'walking', 'zone2']);
});

test('the five-minute recovery rests before it starts holding', () => {
  const session = createCalibrationSession();
  const untilFinal = 60 + 60 + 60 + 120 + 120 + 60; // everything up to the last stage
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

test('the protocol visits every stage in order and completes on the last one', () => {
  const { stages, completed, ticks, session } = playProtocol();

  assert.deepEqual(stages, CALIBRATION_CONDITION_IDS);
  assert.equal(ticks, calibrationDurationSec());
  assert.ok(completed, 'onComplete fires');
  assert.deepEqual(completed.completedIds, CALIBRATION_CONDITION_IDS);
  assert.equal(session.state().done, true);
  assert.equal(session.state().remainingSec, 0);
});

test('only the final stage reports a resting phase', () => {
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

test('skip jumps to the next stage and finishes the protocol from the last', () => {
  const stages = [];
  let completed = false;
  const session = createCalibrationSession({
    onStage(state) {
      stages.push(state.condition.id);
    },
    onComplete() {
      completed = true;
    },
  });

  session.tick();
  session.skip();
  assert.equal(session.state().condition.id, 'standing');
  assert.equal(session.state().elapsedSec, 0);
  assert.deepEqual(session.state().completedIds, ['seated']);

  CALIBRATION_CONDITION_IDS.slice(1).forEach(() => session.skip());
  assert.deepEqual(stages, CALIBRATION_CONDITION_IDS);
  assert.equal(completed, true);
  assert.equal(session.state().done, true);

  session.skip();
  assert.equal(session.state().done, true);
});

test('finish ends the protocol immediately and marks every stage done', () => {
  const session = createCalibrationSession();
  session.tick();
  session.finish();
  assert.equal(session.state().done, true);
  assert.deepEqual(session.state().completedIds, CALIBRATION_CONDITION_IDS);
});

test('the simulated heart rate follows the stage it is holding', () => {
  const session = createCalibrationSession();
  const seated = session.state().demoBpm;
  assert.equal(seated, calibrationCondition('seated').demoBpm);

  for (let i = 0; i < 60 + 60 + 60 + 120; i += 1) session.tick(); // through zone 2
  const zone2 = session.state().demoBpm;
  assert.ok(zone2 > seated, `${zone2} should be above the seated ${seated}`);
  assert.ok(
    Math.abs(zone2 - calibrationCondition('zone2').demoBpm) <= 5,
    `${zone2} should have settled near the zone 2 target`,
  );
});

test('the calibration screen lists every stage and the run screen is not reached first', () => {
  const markup = calibrationMarkup({ settings: { demo: true, multiplier: 10 } });
  CALIBRATION_CONDITIONS.forEach((condition) => {
    assert.match(markup, new RegExp(`data-stage="${condition.id}"`));
    assert.ok(markup.includes(condition.label), `${condition.id} label`);
  });
  assert.match(markup, /id="cal-stage"/);
  assert.match(markup, /id="cal-countdown"/);
  assert.match(markup, /id="cal-hr"/);
  assert.match(markup, /id="cal-skip"/);
});

test('the calibration screen shows the demo speed selector in demo mode only', () => {
  const demo = calibrationMarkup({ settings: { demo: true, multiplier: 100 } });
  assert.match(demo, /class="chip active" data-mult="100"/);
  assert.match(demo, /Simulated/);

  const live = calibrationMarkup({ settings: { demo: false, multiplier: 100 } });
  assert.doesNotMatch(live, /data-mult=/);
  assert.doesNotMatch(live, /Simulated/);
});
