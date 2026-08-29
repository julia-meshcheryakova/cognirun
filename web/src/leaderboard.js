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

export const SYNTHETIC_LABEL = 'SYNTHETIC DATA';

export const SYNTHETIC_DISCLAIMER =
  'Synthetic demo data — the other runners are made up, not real people or research.';

/** Row label for the participant's own score: the only real row in the table. */
export const YOUR_ROW_NAME = 'You (this run)';

/**
 * Ranks the current run inside the synthetic cohort. Deterministic: same points
 * in, same table out, and the real run wins ties so its rank never drifts.
 */
export function leaderboardFor(totalPoints) {
  const you = { name: YOUR_ROW_NAME, points: totalPoints, you: true };
  const rows = [...SYNTHETIC_COHORT.map((entry) => ({ ...entry, you: false })), you].sort(
    (a, b) => b.points - a.points || Number(b.you) - Number(a.you),
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * Leaderboard section markup. The label lives in the table caption as well as the
 * heading, so it stays on screen while the table is scrolled, and every cohort row
 * is marked `synthetic-row` — the participant's score is the only unmarked row.
 */
export function leaderboardSection(totalPoints) {
  const rows = leaderboardFor(totalPoints)
    .map(
      (row) =>
        `<tr class="${row.you ? 'you' : 'synthetic-row'}" data-synthetic="${!row.you}"><td>${row.rank}</td><td>${row.name}</td><td>${row.points}</td></tr>`,
    )
    .join('');

  return `
      <section class="card synthetic" data-synthetic="true">
        <h2>Leaderboard <span class="tag synthetic">${SYNTHETIC_LABEL}</span></h2>
        <p class="hint">${SYNTHETIC_DISCLAIMER}</p>
        <table class="breakdown">
          <caption class="synthetic-caption">${SYNTHETIC_LABEL} — cohort is made up; only “${YOUR_ROW_NAME}” is your score</caption>
          <thead><tr><th>#</th><th>Runner</th><th>Points</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
}
