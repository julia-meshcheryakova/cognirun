import assert from 'node:assert/strict';
import test from 'node:test';

import { COURSES, CHALLENGE_COURSES, questionCountOf } from '../src/config.js';
import { QUESTION_LIBRARY } from '../../question-server/questions.js';
import { selectRunQuestions } from '../src/questions.js';
import { MAX_ROUTE_POINTS, downsample, toRunRecord, upgradeRunRecord } from '../src/history/runRecord.js';
import { createLocalRunStore } from '../src/history/store.js';
import { parseRoute, routeHref, navMarkup } from '../src/ui/nav.js';
import { historyMarkup } from '../src/ui/history.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

function sample(i) {
  return { lat: 52 + i / 1e4, lng: 4, t: i, distance: i * 3, speed: 3, heartRate: i % 2 ? 150 : 0, accuracy: 5 };
}

const answers = [
  { questionId: 't1', category: 'trivia', kilometer: 1, elapsedSeconds: 4.2, points: 90, text: 'Paris', correctAnswer: 'Paris', correct: true, verdict: { method: 'exact' } },
  { questionId: 'l1', category: 'logic', kilometer: 2, elapsedSeconds: 9, points: 0, text: '', correctAnswer: '7', correct: false, verdict: { method: 'empty' } },
];

function record(overrides = {}) {
  return {
    ...toRunRecord({
      snapshot: { distance: 3000, elapsedSeconds: 900, samples: Array.from({ length: 10 }, (_, i) => sample(i)) },
      answers,
      settings: { course: '3k', demo: false },
      finishedAt: new Date('2026-01-05T10:00:00Z'),
    }),
    ...overrides,
  };
}

test('challenge courses ask one question per km', () => {
  assert.deepEqual(CHALLENGE_COURSES, ['3k', '5k', '10k']);
  assert.equal(questionCountOf('3k'), 3);
  assert.equal(questionCountOf('5k'), 5);
  assert.equal(questionCountOf('10k'), 10);
  assert.equal(COURSES['5k'].total, 5000);
});

test('longer runs get distinct questions rotating through the categories', () => {
  const ten = selectRunQuestions(QUESTION_LIBRARY, 10);
  assert.equal(ten.length, 10);
  assert.equal(new Set(ten.map((q) => q.id)).size, 10);
  assert.deepEqual(
    ten.slice(0, 4).map((q) => q.category),
    ['trivia', 'logic', 'math', 'trivia'],
  );
  assert.deepEqual(selectRunQuestions(QUESTION_LIBRARY, 3), selectRunQuestions(QUESTION_LIBRARY));
});

test('a finished run becomes a self-contained record', () => {
  const r = record();
  assert.equal(r.schema, 1);
  assert.equal(r.mode, 'solo');
  assert.equal(r.challengeId, null);
  assert.equal(r.finishedAt, '2026-01-05T10:00:00.000Z');
  assert.equal(r.startedAt, '2026-01-05T09:45:00.000Z');
  assert.equal(r.points, 90);
  assert.equal(r.correct, 1);
  assert.equal(r.total, 2);
  assert.equal(r.hrAvg, 150);
  assert.equal(r.hrMax, 150);
  assert.ok(Math.abs(r.avgSpeed - 3000 / 900) < 1e-9);
  assert.deepEqual(r.answers[0], {
    questionId: 't1', category: 'trivia', km: 1, elapsedS: 4.2, text: 'Paris',
    correctAnswer: 'Paris', correct: true, points: 90, method: 'exact',
  });
  assert.equal(r.route[0].accuracy, undefined, 'route keeps only the stored fields');
  assert.equal(r.synced, false);
  assert.equal(upgradeRunRecord(JSON.parse(JSON.stringify(r))).id, r.id);
  assert.equal(upgradeRunRecord({ schema: 0 }), null);

  const challenge = toRunRecord({
    snapshot: { distance: 0, elapsedSeconds: 0, samples: [] },
    answers: [],
    settings: { course: '5k', demo: true },
    challengeId: '2026-W02-5k',
  });
  assert.equal(challenge.mode, 'challenge');
  assert.equal(challenge.hrAvg, null);
  assert.equal(challenge.avgSpeed, 0);
});

test('long routes are downsampled keeping both ends', () => {
  const samples = Array.from({ length: 5000 }, (_, i) => sample(i));
  const out = downsample(samples);
  assert.equal(out.length, MAX_ROUTE_POINTS);
  assert.equal(out[0], samples[0]);
  assert.equal(out.at(-1), samples.at(-1));
});

test('local store keeps runs newest first, upserts and filters', async () => {
  const store = createLocalRunStore({ storage: memory() });
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);

  const older = record({ id: 'a', finishedAt: '2026-01-01T00:00:00.000Z' });
  const newer = record({ id: 'b', finishedAt: '2026-01-02T00:00:00.000Z', demo: true, course: '5k' });
  await store.save(older);
  await store.save(newer);
  assert.deepEqual((await store.list()).map((r) => r.id), ['b', 'a']);
  assert.deepEqual((await store.list({ includeDemo: false })).map((r) => r.id), ['a']);
  assert.deepEqual((await store.list({ course: '5k' })).map((r) => r.id), ['b']);

  await store.save({ ...older, points: 5 });
  assert.equal((await store.list()).length, 2);
  assert.equal((await store.get('a')).points, 5);

  await store.remove('b');
  assert.equal(await store.get('b'), null);
  assert.equal(changes, 4);
  unsubscribe();
  await store.remove('a');
  assert.equal(changes, 4);
});

test('local store survives corrupt storage and respects its cap', async () => {
  const storage = memory();
  storage.setItem('cognirun.runs.v1', '{oops');
  const store = createLocalRunStore({ storage, limit: 2 });
  assert.deepEqual(await store.list(), []);
  for (const id of ['x', 'y', 'z']) {
    await store.save(record({ id, finishedAt: `2026-01-0${['x', 'y', 'z'].indexOf(id) + 1}T00:00:00.000Z` }));
  }
  assert.deepEqual((await store.list()).map((r) => r.id), ['z', 'y']);
});

test('routes parse from the hash and fall back to the run tab', () => {
  assert.deepEqual(parseRoute('#/history/abc'), { tab: 'history', params: ['abc'] });
  assert.deepEqual(parseRoute('#/challenges'), { tab: 'challenges', params: [] });
  assert.deepEqual(parseRoute(''), { tab: 'run', params: [] });
  assert.deepEqual(parseRoute('#/nope'), { tab: 'run', params: [] });
  assert.equal(routeHref('history', 'a b'), '#/history/a%20b');
  assert.match(navMarkup('history'), /data-tab="history" class="active" aria-current="page"/);
});

test('history lists saved runs and escapes their fields', () => {
  assert.match(historyMarkup([]), /No runs yet/);
  const html = historyMarkup([record({ id: '<x>', demo: true })]);
  assert.match(html, /data-run-id="&lt;x&gt;"/);
  assert.match(html, /demo/);
  assert.match(html, /1\/2 correct/);
});
