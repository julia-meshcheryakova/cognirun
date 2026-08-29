import assert from 'node:assert/strict';
import test from 'node:test';

import { QUESTION_COUNT, RUN_DISTANCE_METERS, createRun } from '../src/run.js';
import { scoreForElapsed } from '../src/scoring.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plays a full demo run, answering every question after `answerDelayMs`. */
function playRun({ multiplier, answerDelayMs }) {
  return new Promise((resolve, reject) => {
    const kilometers = [];
    const answers = [];
    let busy = false;

    const run = createRun({
      demo: true,
      multiplier,
      onUpdate() {},
      async onKilometer(km) {
        kilometers.push(km);
        while (busy) await sleep(5);
        busy = true;
        run.setAnswering(true); // clock drops to real-time rate while answering
        const startedAt = run.now();
        await sleep(answerDelayMs);
        const elapsedSeconds = (run.now() - startedAt) / 1000;
        answers.push({ km, elapsedSeconds, points: scoreForElapsed(elapsedSeconds) });
        run.setAnswering(false);
        busy = false;
        run.noteAnswered();
      },
      onFinish(snapshot) {
        clearTimeout(giveUp);
        resolve({ kilometers, answers, snapshot });
      },
      onError: reject,
    });

    const giveUp = setTimeout(() => reject(new Error('run did not finish in time')), 20_000);
    run.start();
  });
}

test('demo run at x1000 completes 3 km, asks 3 questions and scores them', async () => {
  const startedAt = Date.now();
  const { kilometers, answers, snapshot } = await playRun({
    multiplier: 1000,
    answerDelayMs: 300,
  });

  assert.deepEqual(kilometers, [1, 2, 3]);
  assert.equal(answers.length, QUESTION_COUNT);
  assert.ok(snapshot.distance >= RUN_DISTANCE_METERS, `distance ${snapshot.distance}`);
  assert.ok(snapshot.distance < RUN_DISTANCE_METERS + 1000, `overshoot ${snapshot.distance}`);
  answers.forEach((answer) => {
    assert.ok(answer.elapsedSeconds < 2, `answer clock ran fast: ${answer.elapsedSeconds}s`);
    assert.equal(answer.points, 100);
  });
  assert.ok(Date.now() - startedAt < 10_000, 'x1000 run should take seconds, not minutes');
});

test('pace varies and slows after each kilometer', async () => {
  const { snapshot } = await playRun({ multiplier: 1000, answerDelayMs: 50 });
  const paces = snapshot.samples
    .filter((s) => s.speed > 0.3)
    .map((s) => 1000 / s.speed / 60);

  assert.ok(Math.min(...paces) < 6.2, `fastest pace ${Math.min(...paces)}`);
  assert.ok(Math.max(...paces) > 7, `slowest pace ${Math.max(...paces)}`);
  assert.ok(snapshot.samples.at(-1).heartRate > snapshot.samples[10].heartRate);
});

test('scoring decays linearly from 100 to 50 within the answer window', () => {
  assert.equal(scoreForElapsed(0), 100);
  assert.equal(scoreForElapsed(30), 75);
  assert.equal(scoreForElapsed(60), 50);
  assert.equal(scoreForElapsed(60.5), 0);
});
