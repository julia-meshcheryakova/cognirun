import assert from 'node:assert/strict';
import test from 'node:test';

import { progressSummary } from '../src/progress.js';
import { historyMarkup } from '../src/ui/history.js';
import { progressOverviewMarkup } from '../src/ui/progressOverview.js';
import { answerRowsMarkup, resultsMarkup } from '../src/ui/results.js';
import { runDetailMarkup, runNotFoundMarkup } from '../src/ui/runDetail.js';
import { formatDuration, formatPaceSeconds, formatPbValue, newBestsMarkup } from '../src/ui/runFormat.js';

const NOW = Date.parse('2026-01-21T12:00:00Z');

function answer(km, category, correct, points) {
  return { questionId: `q${km}`, category, km, elapsedS: 4.25, text: correct ? 'Paris' : '', correctAnswer: 'Paris', correct, points, method: 'exact' };
}

function run(id, finishedAt, overrides = {}) {
  const answers = overrides.answers ?? [answer(1, 'trivia', true, 90), answer(2, 'logic', false, 0), answer(3, 'math', true, 70)];
  return {
    id,
    schema: 1,
    startedAt: finishedAt,
    finishedAt,
    mode: overrides.challengeId ? 'challenge' : 'solo',
    challengeId: null,
    course: '3k',
    demo: false,
    distanceM: 3000,
    durationS: 1000,
    avgSpeed: 3,
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

const RUNS = [
  run('demo', '2026-01-20T10:00:00Z', { demo: true, points: 999 }),
  run('five', '2026-01-19T10:00:00Z', { course: '5k', distanceM: 5000, challengeId: '2026-W04-5k' }),
  run('three', '2026-01-13T10:00:00Z'),
];

const count = (html, pattern) => (html.match(pattern) ?? []).length;

test('format helpers', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3600 + 5 * 60 + 9), '1h 05m');
  assert.equal(formatPaceSeconds(330), '5:30 /km');
  assert.equal(formatPaceSeconds(null), '--:--');
  assert.equal(formatPbValue('time', 905), '15:05');
  assert.equal(formatPbValue('accuracy', 2 / 3), '67%');
  assert.equal(formatPbValue('points', 240), '240');
  assert.equal(formatPbValue('points', null), '—');
});

test('history empty state invites a first run', () => {
  const html = historyMarkup([]);
  assert.match(html, /No runs yet/);
  assert.match(html, /href="#\/run"/);
  assert.doesNotMatch(html, /run-item/);
});

test('history shows the progress overview over every run, demo runs badged but not counted', () => {
  const html = historyMarkup(RUNS, { now: NOW });
  assert.equal(count(html, /class="card run-item/g), 3, 'demo runs are listed by default');
  assert.match(html, /data-total="runs"><span class="label">Runs<\/span><strong>2</);
  assert.match(html, /data-total="points"><span class="label">Points<\/span><strong>320</);
  assert.match(html, /data-total="distance">.*<strong>8\.00</);
  assert.match(html, /class="badge demo">demo</);
  assert.match(html, /class="badge challenge">Challenge 2026-W04-5k</);
  assert.match(html, /class="streak" data-current="2" data-longest="2"/);
  assert.match(html, /<tr data-course="3k">/);
  assert.match(html, /<tr data-course="5k">/);
  assert.match(html, /<li data-category="trivia">/);
  assert.match(html, /id="trend-points"/);
  assert.match(html, /id="show-demo" checked/);
  assert.match(html, /data-course="" aria-pressed="true">All</);
  assert.match(html, /href="#\/history\/three"/);
  assert.match(html, /2\/3 correct · <b class="run-points">160<\/b>/);
  assert.match(html, /Runs · 3/);
});

test('history filters by course and can hide demo runs', () => {
  const fiveK = historyMarkup(RUNS, { course: '5k', now: NOW });
  assert.equal(count(fiveK, /class="card run-item/g), 1);
  assert.match(fiveK, /class="chip active" data-course="5k"/);
  assert.match(fiveK, /data-total="runs"><span class="label">Runs<\/span><strong>1</);
  assert.doesNotMatch(fiveK, /<tr data-course="3k">/);

  const noDemo = historyMarkup(RUNS, { showDemo: false, now: NOW });
  assert.equal(count(noDemo, /class="card run-item/g), 2);
  assert.match(noDemo, /1 demo run hidden/);
  assert.match(noDemo, /id="show-demo">/);

  const unknownCourse = historyMarkup(RUNS, { course: '10k', now: NOW });
  assert.equal(count(unknownCourse, /class="card run-item/g), 3, 'a course with no runs falls back to all');
  assert.doesNotMatch(historyMarkup([RUNS[2]]), /show-demo/, 'no toggle without demo runs');
});

test('only demo runs: the list shows them, progress explains why it is empty', () => {
  const html = historyMarkup([RUNS[0]], { now: NOW });
  assert.equal(count(html, /class="card run-item/g), 1);
  assert.match(html, /Only demo runs so far/);
  assert.doesNotMatch(html, /data-total=/);
});

test('progress overview: one run gives no trend, PB cells link to their run', () => {
  const summary = progressSummary([RUNS[2]], { now: NOW });
  const html = progressOverviewMarkup(summary);
  assert.match(html, /Finish two runs/);
  assert.doesNotMatch(html, /trend-points/);
  assert.match(html, /<a href="#\/history\/three">160<\/a>/);
  assert.match(html, /<a href="#\/history\/three">16:40<\/a>/);
  assert.match(html, /<a href="#\/history\/three">67%<\/a>/);
  assert.match(html, /data-category="trivia">[\s\S]*?style="width:100%"/);
  assert.match(html, /data-category="logic">[\s\S]*?style="width:0%"/);
  assert.match(html, /Weekly accuracy/);
  assert.match(html, /class="streak" data-current="1"/);
});

test('history escapes stored text', () => {
  const html = historyMarkup([run('<x>', '2026-01-13T10:00:00Z', { challengeId: '<b>' })], { now: NOW });
  assert.match(html, /data-run-id="&lt;x&gt;"/);
  assert.match(html, /href="#\/history\/%3Cx%3E"/);
  assert.match(html, /Challenge &lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test('post-run results render from a RunRecord with stable selectors', () => {
  const html = resultsMarkup(RUNS[2], { historyHref: '#/history/three' });
  assert.match(html, /<h1>Run complete<\/h1>/);
  assert.match(html, /class="metric hero points">\s*<span class="label">Total points<\/span>\s*<strong>160<\/strong>/);
  assert.match(html, /<h2>Questions<\/h2>\s*<table class="breakdown">/);
  assert.equal(count(html, /✅/g), 2);
  assert.equal(count(html, /❌/g), 1);
  assert.match(html, /id="restart"/);
  assert.match(html, /href="#\/history\/three">Saved to your history/);
  assert.match(html, /Leaderboard/);
  assert.doesNotMatch(html, /New PB!/);
  assert.doesNotMatch(html, /Avg HR/);

  const pb = resultsMarkup(run('x', '2026-01-21T10:00:00Z', { hrAvg: 150, hrMax: 171 }), {
    newBests: [
      { kind: 'points', label: 'Points', value: 200, previous: 160 },
      { kind: 'time', label: 'Time', value: 950, previous: null },
    ],
  });
  assert.match(pb, /New PB!/);
  assert.match(pb, /data-pb="points">Points 200 <small>was 160<\/small>/);
  assert.match(pb, /data-pb="time">Time 15:50<\/span>/);
  assert.match(pb, /Avg HR<\/span><strong>150</);
  assert.equal(newBestsMarkup([]), '');
});

test('answer rows escape what the runner said and mark ungraded answers', () => {
  const rows = answerRowsMarkup([{ ...answer(1, 'trivia', null, 0), text: '<img>' }]);
  assert.match(rows, /&lt;img&gt;/);
  assert.match(rows, /<td>—<\/td>/);
  assert.match(rows, /4\.3s|4\.2s/);
  assert.match(answerRowsMarkup([answer(2, 'logic', false, 0)]), /\(no answer\)/);
});

test('run detail shares the report, adds back, badges, held PBs and delete', () => {
  const html = runDetailMarkup(RUNS[1], { runs: RUNS });
  assert.match(html, /class="screen run-report run-detail"/);
  assert.match(html, /class="back-link" href="#\/history">← History/);
  assert.match(html, /<h1>5K run<\/h1>/);
  assert.match(html, /Challenge 2026-W04-5k/);
  assert.match(html, /🏆 5K PB/);
  assert.match(html, /<h2>Questions<\/h2>\s*<table class="breakdown">/);
  assert.match(html, /id="delete-run"/);
  assert.match(html, /id="delete-confirm" hidden/);
  assert.doesNotMatch(html, /Leaderboard/);
  assert.doesNotMatch(html, /id="restart"/);

  assert.doesNotMatch(runDetailMarkup(RUNS[0], { runs: RUNS }), /PB<\/span>/, 'demo runs hold no PBs');
  assert.match(runNotFoundMarkup(), /Run not found/);
});
