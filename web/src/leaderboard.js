/**
 * Demo-only leaderboard. The cohort below is hand-written synthetic data, not
 * real runners and not research: it exists so the results screen has something
 * to rank the current run against while the app runs in demo mode.
 */
export const SYNTHETIC_COHORT = [
  { name: 'Demo runner “Kite”', points: 291 },
  { name: 'Demo runner “Moss”', points: 274 },
  { name: 'Demo runner “Juniper”', points: 248 },
  { name: 'Demo runner “Ash”', points: 213 },
  { name: 'Demo runner “Wren”', points: 176 },
  { name: 'Demo runner “Pike”', points: 132 },
];

export const SYNTHETIC_DISCLAIMER =
  'Synthetic demo data — the other runners are made up, not real people or research.';

/**
 * Ranks the current run inside the synthetic cohort. Deterministic: same points
 * in, same table out, and the real run wins ties so its rank never drifts.
 */
export function leaderboardFor(totalPoints) {
  const you = { name: 'You (this run)', points: totalPoints, you: true };
  const rows = [...SYNTHETIC_COHORT.map((entry) => ({ ...entry, you: false })), you].sort(
    (a, b) => b.points - a.points || Number(b.you) - Number(a.you),
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
