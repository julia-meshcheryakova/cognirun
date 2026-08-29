import assert from 'node:assert/strict';
import test from 'node:test';

import { SYNTHETIC_COHORT, leaderboardFor } from '../src/leaderboard.js';

test('includes the current run alongside the whole synthetic cohort', () => {
  const rows = leaderboardFor(200);
  assert.equal(rows.length, SYNTHETIC_COHORT.length + 1);
  assert.deepEqual(
    rows.map((r) => r.rank),
    rows.map((_, i) => i + 1),
  );
  const you = rows.filter((r) => r.you);
  assert.equal(you.length, 1);
  assert.equal(you[0].points, 200);
});

test('sorts by points descending', () => {
  const points = leaderboardFor(220).map((r) => r.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
});

test('is deterministic for the same score', () => {
  assert.deepEqual(leaderboardFor(213), leaderboardFor(213));
});

test('the run wins ties against the synthetic cohort', () => {
  const tied = SYNTHETIC_COHORT[3].points;
  const rows = leaderboardFor(tied);
  const you = rows.find((r) => r.you);
  assert.equal(you.rank, 4);
});

test('a perfect and an empty run land at the ends of the table', () => {
  assert.equal(leaderboardFor(300).find((r) => r.you).rank, 1);
  assert.equal(leaderboardFor(0).find((r) => r.you).rank, SYNTHETIC_COHORT.length + 1);
});

test('does not mutate the synthetic cohort', () => {
  const before = JSON.stringify(SYNTHETIC_COHORT);
  leaderboardFor(150);
  assert.equal(JSON.stringify(SYNTHETIC_COHORT), before);
});
