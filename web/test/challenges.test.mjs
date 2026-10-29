import assert from 'node:assert/strict';
import test from 'node:test';

import {
  challengeSummary,
  compareEntries,
  isCountedEntry,
  pastChallengeIds,
  rankEntries,
} from '../src/challenges/entries.js';
import { challengeById } from '../src/challenges/schedule.js';
import {
  challengeDetailMarkup,
  challengesMarkup,
  leaderboardMarkup,
} from '../src/ui/challenges.js';

// Thursday of ISO week 2026-W44.
const NOW = new Date('2026-10-29T17:00:00Z');
const C3 = challengeById('2026-W44-3k');

function run(id, over = {}) {
  return {
    id,
    challengeId: '2026-W44-3k',
    course: '3k',
    demo: false,
    distanceM: 3000,
    durationS: 1200,
    points: 200,
    correct: 2,
    total: 3,
    finishedAt: '2026-10-27T08:00:00.000Z',
    ...over,
  };
}

test('only full-distance, non-demo runs of the same challenge and course count', () => {
  assert.equal(isCountedEntry(run('a'), C3), true);
  assert.equal(isCountedEntry(run('a', { distanceM: 2999.5 }), C3), true);
  assert.equal(isCountedEntry(run('a', { distanceM: 2500 }), C3), false);
  assert.equal(isCountedEntry(run('a', { demo: true }), C3), false);
  assert.equal(isCountedEntry(run('a', { course: '5k' }), C3), false);
  assert.equal(isCountedEntry(run('a', { challengeId: '2026-W43-3k' }), C3), false);
  assert.equal(isCountedEntry(run('a', { challengeId: null }), C3), false);
});

test('entries rank by points, then time, then the earlier finish', () => {
  const ranked = rankEntries([
    run('slow', { points: 300, durationS: 1300 }),
    run('low', { points: 100, durationS: 900 }),
    run('late', { points: 300, durationS: 1100, finishedAt: '2026-10-28T08:00:00.000Z' }),
    run('fast', { points: 300, durationS: 1100 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['fast', 'late', 'slow', 'low'],
  );
  assert.equal(compareEntries(run('x'), run('y')), 0);
});

test('challengeSummary picks the best counted entry and counts demo attempts apart', () => {
  const summary = challengeSummary(C3, [
    run('a', { points: 150 }),
    run('b', { points: 250 }),
    run('demo', { demo: true, points: 900 }),
    run('partial', { distanceM: 1000, points: 900 }),
    run('other', { challengeId: '2026-W44-5k', course: '5k' }),
  ]);
  assert.equal(summary.best.id, 'b');
  assert.equal(summary.attempts, 2);
  assert.equal(summary.demoAttempts, 1);
  assert.deepEqual(
    summary.entries.map((r) => r.id),
    ['b', 'a'],
  );
  assert.equal(challengeSummary(C3, []).best, null);
});

test('pastChallengeIds lists earlier challenges once, newest first', () => {
  const ids = pastChallengeIds(
    [
      run('a', { challengeId: '2026-W42-3k' }),
      run('b', { challengeId: '2026-W43-5k' }),
      run('c', { challengeId: '2026-W42-3k' }),
      run('d'),
      run('e', { challengeId: null }),
    ],
    ['2026-W44-3k', '2026-W44-5k', '2026-W44-10k'],
  );
  assert.deepEqual(ids, ['2026-W43-5k', '2026-W42-3k']);
});

test('the list shows this week\'s 3K, 5K and 10K with their question counts', () => {
  const html = challengesMarkup({ runs: [], now: NOW });
  assert.match(html, /This week · 2026-W44/);
  for (const [id, n] of [
    ['2026-W44-3k', 3],
    ['2026-W44-5k', 5],
    ['2026-W44-10k', 10],
  ]) {
    assert.match(html, new RegExp(`data-challenge-id="${id}"`));
    assert.match(html, new RegExp(`data-start-challenge="${id}"`));
    assert.match(html, new RegExp(`${n} questions · easy → hard`));
  }
  assert.match(html, /Not entered yet/);
  assert.doesNotMatch(html, /Past challenges/);
  assert.doesNotMatch(html, /demo-note/);
});

test('the list shows your best, demo attempts and past challenges', () => {
  const html = challengesMarkup({
    runs: [
      run('a', { points: 280 }),
      run('d', { demo: true }),
      run('old', { challengeId: '2026-W43-5k', course: '5k', distanceM: 5000, points: 410 }),
    ],
    now: NOW,
    demo: true,
  });
  assert.match(html, /class="challenge-best-points">280</);
  assert.match(html, /1 attempt · 1 demo attempt \(not counted\)/);
  assert.match(html, /Past challenges/);
  assert.match(html, /href="#\/challenges\/2026-W43-5k"/);
  assert.match(html, /class="challenge-best-points">410</);
  assert.match(html, /demo-note/);
  assert.match(html, /Try in demo/);
});

test('detail: signed out asks to sign in; closed challenges have no start button', () => {
  const past = challengeById('2026-W43-3k');
  const html = challengeDetailMarkup({
    challenge: past,
    runs: [run('a', { challengeId: past.id })],
    now: NOW,
  });
  assert.match(html, /Sign in to compare/);
  assert.match(html, /closed/);
  assert.doesNotMatch(html, /data-start-challenge/);
  assert.match(html, /href="#\/history\/a"/);

  const open = challengeDetailMarkup({ challenge: C3, runs: [], now: NOW });
  assert.match(open, /data-start-challenge="2026-W44-3k"/);
  assert.match(open, /ends in/);
});

test('leaderboard rows escape names and highlight you', () => {
  const html = leaderboardMarkup([
    { displayName: '<b>Ann</b>', points: 300, durationS: 1100, isMe: false },
    { displayName: 'Me', points: 200, durationS: 1200, isMe: true },
  ]);
  assert.match(html, /&lt;b&gt;Ann&lt;\/b&gt;/);
  assert.match(html, /<li class="me"><span>Me<\/span>/);
  assert.match(leaderboardMarkup([]), /No entries yet/);
});
