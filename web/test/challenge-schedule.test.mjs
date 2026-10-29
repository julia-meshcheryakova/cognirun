import assert from 'node:assert/strict';
import test from 'node:test';

import {
  challengeById,
  isOpen,
  isoWeek,
  parseChallengeId,
  timeLeft,
  weekStart,
  weeklyChallenges,
} from '../src/challenges/schedule.js';

test('ISO weeks follow the Thursday rule across year boundaries', () => {
  assert.deepEqual(isoWeek(new Date('2026-01-01T12:00:00Z')), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek(new Date('2027-01-01T12:00:00Z')), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(new Date('2024-12-30T00:00:00Z')), { year: 2025, week: 1 });
  assert.deepEqual(isoWeek(new Date('2026-10-29T17:00:00Z')), { year: 2026, week: 44 });
  assert.equal(weekStart({ year: 2026, week: 44 }).toISOString(), '2026-10-26T00:00:00.000Z');
});

test('each week has a 3K, 5K and 10K challenge with stable ids', () => {
  const now = new Date('2026-10-29T17:00:00Z');
  const challenges = weeklyChallenges(now);
  assert.deepEqual(challenges.map((c) => c.id), ['2026-W44-3k', '2026-W44-5k', '2026-W44-10k']);
  const [three] = challenges;
  assert.equal(three.title, 'Weekly 3K');
  assert.equal(three.startsAt, '2026-10-26T00:00:00.000Z');
  assert.equal(three.endsAt, '2026-11-02T00:00:00.000Z');
  assert.ok(isOpen(three, now));
  assert.ok(!isOpen(three, new Date('2026-11-02T00:00:00Z')));
  assert.equal(timeLeft(three, now), '3d 7h');
  assert.deepEqual(challengeById('2026-W44-5k'), challenges[1]);
});

test('challenge ids are validated', () => {
  assert.deepEqual(parseChallengeId('2026-W02-10k'), { year: 2026, week: 2, course: '10k' });
  assert.equal(parseChallengeId('2026-W02-60m'), null);
  assert.equal(parseChallengeId('nope'), null);
  assert.equal(challengeById(undefined), null);
});
