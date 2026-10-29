import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accuracyOf,
  bestsHeldBy,
  categoryStats,
  countedRuns,
  isComplete,
  isoWeekKey,
  newPersonalBests,
  paceOf,
  personalBests,
  progressSummary,
  recentTrend,
  totals,
  weekStart,
  weeklyCategoryStats,
  weeklyStreak,
} from '../src/progress.js';

const COURSE_M = { '3k': 3000, '5k': 5000, '10k': 10000, '300m': 300 };

function answer(category, correct, elapsedS = 5, points = correct ? 80 : 0) {
  return { questionId: `${category}-x`, category, km: 1, elapsedS, text: 'a', correctAnswer: 'a', correct, points, method: 'exact' };
}

/** A stored run; points/correct/total follow from `answers` unless overridden. */
function run(id, finishedAt, overrides = {}) {
  const answers = overrides.answers ?? [answer('trivia', true), answer('logic', false), answer('math', true)];
  const course = overrides.course ?? '3k';
  const distanceM = overrides.distanceM ?? COURSE_M[course];
  const durationS = overrides.durationS ?? 1000;
  return {
    id,
    schema: 1,
    startedAt: finishedAt,
    finishedAt,
    mode: overrides.challengeId ? 'challenge' : 'solo',
    challengeId: null,
    course,
    demo: false,
    distanceM,
    durationS,
    avgSpeed: durationS ? distanceM / durationS : 0,
    points: answers.reduce((s, a) => s + a.points, 0),
    correct: answers.filter((a) => a.correct).length,
    total: answers.length,
    hrAvg: null,
    hrMax: null,
    answers,
    route: [],
    synced: false,
    ...overrides,
  };
}

test('ISO weeks start on Monday (UTC) and use ISO week-numbering years', () => {
  assert.equal(new Date(weekStart('2026-01-07T12:00:00Z')).toISOString(), '2026-01-05T00:00:00.000Z');
  assert.equal(new Date(weekStart('2026-01-11T23:59:00Z')).toISOString(), '2026-01-05T00:00:00.000Z');
  assert.equal(new Date(weekStart('2026-01-12T00:00:00Z')).toISOString(), '2026-01-12T00:00:00.000Z');
  assert.equal(isoWeekKey('2026-01-05T00:00:00Z'), '2026-W02');
  assert.equal(isoWeekKey('2026-01-01T10:00:00Z'), '2026-W01');
  assert.equal(isoWeekKey('2027-01-01T10:00:00Z'), '2026-W53');
  assert.equal(isoWeekKey('2024-12-30T10:00:00Z'), '2025-W01');
  assert.equal(isoWeekKey('2026-10-29T10:00:00Z'), '2026-W44');
});

test('demo runs are left out unless asked for, and course narrows the set', () => {
  const runs = [run('a', '2026-01-05T10:00:00Z'), run('b', '2026-01-06T10:00:00Z', { demo: true, course: '5k' })];
  assert.deepEqual(countedRuns(runs).map((r) => r.id), ['a']);
  assert.deepEqual(countedRuns(runs, { includeDemo: true }).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(countedRuns(runs, { includeDemo: true, course: '5k' }).map((r) => r.id), ['b']);
  assert.deepEqual(countedRuns(runs, { course: null }).map((r) => r.id), ['a']);
});

test('totals add up runs, distance, time and points', () => {
  assert.deepEqual(totals([]), { runs: 0, distanceM: 0, durationS: 0, points: 0 });
  assert.deepEqual(
    totals([run('a', '2026-01-05T10:00:00Z'), run('b', '2026-01-06T10:00:00Z', { course: '5k', durationS: 1800 })]),
    { runs: 2, distanceM: 8000, durationS: 2800, points: 320 },
  );
});

test('pace, accuracy and completeness of a single run', () => {
  assert.equal(paceOf(run('a', '2026-01-05T10:00:00Z', { durationS: 900 })), 300);
  assert.equal(paceOf(run('a', '2026-01-05T10:00:00Z', { distanceM: 0 })), null);
  assert.equal(accuracyOf(run('a', '2026-01-05T10:00:00Z')), 2 / 3);
  assert.equal(accuracyOf(run('a', '2026-01-05T10:00:00Z', { answers: [] })), null);
  assert.equal(isComplete(run('a', '2026-01-05T10:00:00Z')), true);
  assert.equal(isComplete(run('a', '2026-01-05T10:00:00Z', { distanceM: 2500 })), false);
  assert.equal(isComplete(run('a', '2026-01-05T10:00:00Z', { course: 'mystery', distanceM: 1e6 })), false);
});

test('personal bests per course: best points, fastest full course, best accuracy; ties keep the first', () => {
  const runs = [
    run('slow-good', '2026-01-05T10:00:00Z', { durationS: 1200, answers: [answer('trivia', true), answer('logic', true), answer('math', true)] }),
    run('fast', '2026-01-12T10:00:00Z', { durationS: 900 }),
    run('short', '2026-01-13T10:00:00Z', { durationS: 400, distanceM: 1500 }),
    run('tie', '2026-01-14T10:00:00Z', { durationS: 1300, answers: [answer('trivia', true), answer('logic', true), answer('math', true)] }),
    run('ten', '2026-01-15T10:00:00Z', { course: '10k', durationS: 3600 }),
    run('test', '2026-01-16T10:00:00Z', { course: '300m', durationS: 90 }),
  ];
  const bests = personalBests(runs);
  assert.deepEqual(bests.map((b) => b.course), ['3k', '10k', '300m'], 'COURSES order');
  const [threeK] = bests;
  assert.equal(threeK.label, '3K');
  assert.equal(threeK.runs, 4);
  assert.deepEqual([threeK.points.value, threeK.points.runId], [240, 'slow-good']);
  assert.deepEqual([threeK.fastest.value, threeK.fastest.runId], [900, 'fast'], 'the short run does not count');
  assert.deepEqual([threeK.accuracy.value, threeK.accuracy.runId], [1, 'slow-good']);
  assert.equal(personalBests([run('x', '2026-01-05T10:00:00Z', { distanceM: 10 })])[0].fastest, null);
  assert.deepEqual(personalBests([]), []);
});

test('category accuracy counts graded answers; answer time counts all', () => {
  const runs = [
    run('a', '2026-01-05T10:00:00Z', {
      answers: [answer('trivia', true, 4), answer('trivia', false, 8), answer('logic', null, 6), answer('math', true, 10)],
    }),
    run('b', '2026-01-06T10:00:00Z', { answers: [answer('math', false, 20)] }),
  ];
  const [trivia, logic, math] = categoryStats(runs);
  assert.deepEqual(
    { ...trivia },
    { category: 'trivia', label: 'Trivia', answered: 2, graded: 2, correct: 1, accuracy: 0.5, avgTimeS: 6 },
  );
  assert.equal(logic.graded, 0);
  assert.equal(logic.accuracy, null);
  assert.equal(logic.avgTimeS, 6);
  assert.equal(math.label, 'Maths');
  assert.equal(math.accuracy, 0.5);
  assert.equal(math.avgTimeS, 15);
  assert.ok(categoryStats([]).every((c) => c.accuracy === null && c.avgTimeS === null));
});

test('weekly category buckets cover the last N weeks, oldest first, empty weeks included', () => {
  const now = Date.parse('2026-01-21T12:00:00Z'); // W04
  const runs = [
    run('w2', '2026-01-06T10:00:00Z', { answers: [answer('trivia', true)] }),
    run('w4a', '2026-01-19T10:00:00Z', { answers: [answer('trivia', false)] }),
    run('w4b', '2026-01-20T10:00:00Z', { answers: [answer('trivia', true)] }),
    run('old', '2025-11-01T10:00:00Z', { answers: [answer('trivia', true)] }),
  ];
  const weekly = weeklyCategoryStats(runs, { weeks: 3, now });
  assert.deepEqual(weekly.map((w) => w.week), ['2026-W02', '2026-W03', '2026-W04']);
  assert.deepEqual(weekly.map((w) => w.runs), [1, 0, 2]);
  assert.equal(weekly[0].start, '2026-01-05T00:00:00.000Z');
  assert.deepEqual(weekly.map((w) => w.categories[0].accuracy), [1, null, 0.5]);
});

test('trend lists the most recent runs oldest first with points, pace and accuracy', () => {
  const runs = [
    run('c', '2026-01-07T10:00:00Z', { durationS: 600 }),
    run('a', '2026-01-05T10:00:00Z', { durationS: 900 }),
    run('b', '2026-01-06T10:00:00Z', { distanceM: 0 }),
  ];
  const trend = recentTrend(runs, { limit: 2 });
  assert.deepEqual(trend.map((t) => t.id), ['b', 'c']);
  assert.equal(trend[0].paceSPerKm, null);
  assert.equal(trend[1].paceSPerKm, 200);
  assert.equal(trend[1].points, 160);
  assert.equal(trend[1].accuracy, 2 / 3);
  assert.equal(recentTrend(runs).length, 3);
});

test('weekly streak: current survives an unfinished week, longest spans history', () => {
  const now = Date.parse('2026-02-04T12:00:00Z'); // W06
  const at = (iso) => run(iso, iso);
  const runs = [
    // W45..W47 of 2025: three in a row
    at('2025-11-03T10:00:00Z'), at('2025-11-12T10:00:00Z'), at('2025-11-20T10:00:00Z'),
    // W03..W05 of 2026, two runs in W04
    at('2026-01-13T10:00:00Z'), at('2026-01-19T10:00:00Z'), at('2026-01-25T22:00:00Z'), at('2026-01-28T10:00:00Z'),
  ];
  assert.deepEqual(weeklyStreak(runs, { now }), { current: 3, longest: 3, thisWeek: false });
  assert.deepEqual(weeklyStreak([...runs, at('2026-02-02T08:00:00Z')], { now }), {
    current: 4, longest: 4, thisWeek: true,
  });
  assert.equal(weeklyStreak(runs, { now: Date.parse('2026-02-11T12:00:00Z') }).current, 0, 'a missed week breaks it');
  assert.deepEqual(weeklyStreak([], { now }), { current: 0, longest: 0, thisWeek: false });
  // Across a year boundary: 2026-W53 then 2027-W01.
  const yearEnd = [at('2026-12-31T10:00:00Z'), at('2027-01-05T10:00:00Z')];
  assert.equal(weeklyStreak(yearEnd, { now: Date.parse('2027-01-06T10:00:00Z') }).current, 2);
});

test('new personal bests compare a finished run with the earlier ones on its course', () => {
  const earlier = [
    run('a', '2026-01-05T10:00:00Z', { durationS: 1000 }),
    run('five', '2026-01-06T10:00:00Z', { course: '5k', answers: [answer('trivia', true, 5, 300)] }),
  ];
  const perfect = [answer('trivia', true, 5, 90), answer('logic', true, 5, 90), answer('math', true, 5, 90)];
  const record = run('new', '2026-01-08T10:00:00Z', { durationS: 950, answers: perfect });
  const found = newPersonalBests(record, [record, ...earlier]);
  assert.deepEqual(found, [
    { kind: 'points', value: 270, previous: 160, label: 'Points' },
    { kind: 'time', value: 950, previous: 1000, label: 'Time' },
    { kind: 'accuracy', value: 1, previous: 2 / 3, label: 'Accuracy' },
  ]);

  const worse = run('worse', '2026-01-08T10:00:00Z', { durationS: 1100, answers: [answer('trivia', false)] });
  assert.deepEqual(newPersonalBests(worse, earlier), []);
  const equal = run('equal', '2026-01-08T10:00:00Z');
  assert.deepEqual(newPersonalBests(equal, earlier), [], 'equalling a PB is not a new one');

  assert.deepEqual(newPersonalBests(run('first', '2026-01-08T10:00:00Z', { course: '10k' }), earlier), [], 'nothing to beat');
  const demo = { ...record, demo: true };
  assert.deepEqual(newPersonalBests(demo, earlier), [], 'demo runs set no PBs');
  assert.equal(newPersonalBests(demo, earlier, { includeDemo: true }).length, 3);
  assert.deepEqual(
    newPersonalBests(record, [run('demo-old', '2026-01-04T10:00:00Z', { demo: true })]),
    [],
    'demo runs are not something to beat either',
  );
  const later = run('later', '2026-02-01T10:00:00Z', { answers: perfect.map((a) => ({ ...a, points: 100 })) });
  assert.equal(newPersonalBests(record, [...earlier, later]).length, 3, 'runs after it do not count');

  const incomplete = run('part', '2026-01-08T10:00:00Z', { durationS: 100, distanceM: 1000 });
  assert.ok(!newPersonalBests(incomplete, earlier).some((pb) => pb.kind === 'time'));
  const firstFull = run('full', '2026-01-09T10:00:00Z', { durationS: 2000 });
  assert.deepEqual(
    newPersonalBests(firstFull, [run('p', '2026-01-05T10:00:00Z', { distanceM: 100 })]).find((pb) => pb.kind === 'time'),
    { kind: 'time', value: 2000, previous: null, label: 'Time' },
    'the first full course is a time PB',
  );
});

test('bestsHeldBy names the PBs a stored run holds on its course', () => {
  const a = run('a', '2026-01-05T10:00:00Z', { durationS: 800 });
  const b = run('b', '2026-01-06T10:00:00Z', { answers: [answer('trivia', true, 5, 300)] });
  assert.deepEqual(bestsHeldBy(a, [a, b]), ['time']);
  assert.deepEqual(bestsHeldBy(b, [a, b]), ['points', 'accuracy']);
  assert.deepEqual(bestsHeldBy({ ...a, demo: true }, [a, b]), []);
});

test('progress summary bundles everything for the counted runs', () => {
  const now = Date.parse('2026-01-21T12:00:00Z');
  const runs = [
    run('a', '2026-01-20T10:00:00Z'),
    run('b', '2026-01-13T10:00:00Z', { course: '5k' }),
    run('d', '2026-01-19T10:00:00Z', { demo: true }),
  ];
  const all = progressSummary(runs, { now });
  assert.deepEqual(all.runs.map((r) => r.id), ['a', 'b']);
  assert.equal(all.totals.runs, 2);
  assert.equal(all.bests.length, 2);
  assert.equal(all.categories.length, 3);
  assert.equal(all.weekly.length, 6);
  assert.deepEqual(all.trend.map((t) => t.id), ['b', 'a']);
  assert.deepEqual(all.streak, { current: 2, longest: 2, thisWeek: true });

  const fiveK = progressSummary(runs, { now, course: '5k' });
  assert.deepEqual(fiveK.runs.map((r) => r.id), ['b']);
  assert.equal(progressSummary(runs, { now, includeDemo: true }).totals.runs, 3);
});
