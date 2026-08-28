import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMotorCost,
  computeSessionResults,
  normaliseDigits,
  parseBinary,
  parseIdeas,
  scoreRecall,
  scoreTask,
} from '../www/js/metrics.js';

test('spoken binary and digit answers normalise correctly', () => {
  assert.equal(parseBinary('Yeah, that is true.'), true);
  assert.equal(parseBinary('No, false'), false);
  assert.equal(normaliseDigits('eight two six three'), '8263');
});

test('recall counts duplicate targets once and separates intrusions', () => {
  const result = scoreRecall('river river candle banana', ['river', 'candle', 'orbit']);
  assert.deepEqual(result.correct, ['river', 'candle']);
  assert.deepEqual(result.intrusions, ['banana']);
  assert.ok(result.score < 2 / 3);
});

test('creativity fluency is auditable', () => {
  assert.deepEqual(parseIdeas('plant pot, phone stand, plant pot and bird feeder'), ['plant pot', 'phone stand', 'bird feeder']);
  const outcome = scoreTask({ mode: 'free' }, 'one idea, second idea, third idea', 2100);
  assert.equal(outcome.ideas.length, 3);
  assert.equal(outcome.needsReview, true);
});

test('equation scoring preserves accuracy and real response time', () => {
  const correct = scoreTask({ mode: 'binary', answer: true }, 'true', 1600);
  const wrong = scoreTask({ mode: 'binary', answer: true }, 'false', 900);
  assert.equal(correct.correct, true);
  assert.equal(correct.responseMs, 1600);
  assert.equal(wrong.rawScore, 0);
});

test('session results create baseline-relative curves and motor cost', () => {
  const task = (domain, mode = 'binary') => ({ domain, mode });
  const trial = (id, condition, domain, score, speedBefore = 2, speedDuring = 2) => ({
    id, condition, task: task(domain), outcome: { usable: true, rawScore: score, correct: true, responseMs: 1500 },
    telemetryWindow: { speedBefore, speedDuring },
  });
  const session = {
    kind: 'participant',
    protocol: { stages: ['seated', 'walking', 'zone2', 'zone3'].map((id) => ({ id })) },
    trials: [
      trial('a', 'seated', 'reasoning', .8),
      trial('b', 'walking', 'reasoning', .9, 2, 1.9),
      trial('c', 'zone2', 'reasoning', .85, 2.6, 2.55),
      trial('d', 'zone3', 'reasoning', .55, 3.1, 2.8),
    ],
    telemetry: [{ distanceM: 1600 }],
  };
  const result = computeSessionResults(session);
  assert.equal(result.curves.reasoning[0].index, 100);
  assert.equal(result.curves.reasoning[1].index, 110);
  assert.equal(result.breakpoint.condition, 'zone3');
  assert.ok(result.motorCost > 0);
  assert.equal(result.distanceKm, 1.6);
});

test('motor cost excludes stop and recovery transitions', () => {
  const transitionTrial = {
    condition: 'recovery0',
    telemetryWindow: { speedBefore: 3.4, speedDuring: 0 },
  };
  assert.equal(calculateMotorCost(transitionTrial), null);
});
