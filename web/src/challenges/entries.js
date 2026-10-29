import { COURSES } from '../config.js';

/**
 * Challenge entries: a challenge run is any saved RunRecord carrying the
 * challenge's id. Only non-demo runs that covered the whole course count;
 * the best one is the runner's entry (most points, then fastest).
 */

export function isCountedEntry(run, challenge) {
  return (
    run.challengeId === challenge.id &&
    !run.demo &&
    run.course === challenge.course &&
    run.distanceM >= courseMeters(challenge) - 1
  );
}

function courseMeters(challenge) {
  return COURSES[challenge.course]?.total ?? Infinity;
}

/** Most points first, then the faster run, then the earlier one. */
export function compareEntries(a, b) {
  return (
    b.points - a.points ||
    a.durationS - b.durationS ||
    a.finishedAt.localeCompare(b.finishedAt)
  );
}

export function rankEntries(runs) {
  return runs.slice().sort(compareEntries);
}

/**
 * What the Challenges screen shows for one challenge from the runner's own runs.
 *
 * @returns {{ challenge, best: object|null, attempts: number, demoAttempts: number, entries: object[] }}
 */
export function challengeSummary(challenge, runs) {
  const mine = runs.filter((r) => r.challengeId === challenge.id);
  const entries = rankEntries(mine.filter((r) => isCountedEntry(r, challenge)));
  return {
    challenge,
    best: entries[0] ?? null,
    attempts: entries.length,
    demoAttempts: mine.filter((r) => r.demo).length,
    entries,
  };
}

/** Challenges the runner took part in before this week, newest first. */
export function pastChallengeIds(runs, currentIds) {
  const ids = new Set();
  for (const run of runs) {
    if (run.challengeId && !currentIds.includes(run.challengeId)) ids.add(run.challengeId);
  }
  return [...ids].sort().reverse();
}
