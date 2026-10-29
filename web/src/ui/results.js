import { drawRoute, drawSpeedProfile } from '../charts.js';
import { escapeHtml, formatClock, formatKm, formatPace, formatSpeed } from '../format.js';
import { leaderboardSection } from '../leaderboard.js';
import { categoryBreakdown } from '../percentile.js';
import { CATEGORY_LABELS } from '../questions.js';
import { newBestsMarkup } from './runFormat.js';

/**
 * One renderer for a finished run, working from a stored RunRecord: the
 * post-run results page and the History run detail page both use it.
 */

function verdictLabel(answer) {
  if (answer.correct === null || answer.correct === undefined) return '—';
  return answer.correct ? '✅' : '❌';
}

export function answerRowsMarkup(answers) {
  return answers
    .map(
      (a) =>
        `<tr><td>${a.km}</td><td>${CATEGORY_LABELS[a.category] ?? '—'}</td><td>${Number(a.elapsedS ?? 0).toFixed(1)}s</td><td>${
          a.text ? escapeHtml(a.text) : '(no answer)'
        }</td><td>${escapeHtml(a.correctAnswer ?? '—')}</td><td>${verdictLabel(a)}</td><td>${a.points}</td></tr>`,
    )
    .join('');
}

/**
 * @param {import('../history/runRecord.js').RunRecord} record
 * @param {object} options
 * @param {string} options.heading      page heading (already safe HTML)
 * @param {string} [options.top]        markup above the heading (back link)
 * @param {string} [options.meta]       markup under the heading (date, badges)
 * @param {string} [options.pbs]        PB badges markup (new or held)
 * @param {boolean} [options.leaderboard] show the synthetic demo leaderboard
 * @param {string} [options.footer]     actions at the bottom
 * @param {string} [options.className]  extra class on the <main>
 */
export function runReportMarkup(
  record,
  { heading, top = '', meta = '', pbs = '', leaderboard = false, footer = '', className = '' },
) {
  const answers = record.answers ?? [];
  const categories = categoryBreakdown(answers);
  const hasHeartRate = Number.isFinite(record.hrAvg) && record.hrAvg > 0;

  return `
    <main class="screen run-report${className ? ` ${className}` : ''}" data-run-id="${escapeHtml(String(record.id))}">
      ${top}
      <h1>${heading}</h1>
      ${meta}
      <div class="pb-slot">${pbs}</div>

      <div class="metric hero points">
        <span class="label">Total points</span>
        <strong>${record.points}</strong>
      </div>

      <div class="grid">
        <div class="metric"><span class="label">Distance</span><strong>${formatKm(record.distanceM)}</strong><span class="unit">km</span></div>
        <div class="metric"><span class="label">Time</span><strong>${formatClock(record.durationS)}</strong></div>
        <div class="metric"><span class="label">Avg pace</span><strong>${formatPace(record.avgSpeed)}</strong><span class="unit">${formatSpeed(record.avgSpeed)}</span></div>
      </div>
      ${
        hasHeartRate
          ? `<div class="grid hero-grid">
        <div class="metric"><span class="label">Avg HR</span><strong>${record.hrAvg}</strong><span class="unit">bpm</span></div>
        <div class="metric"><span class="label">Max HR</span><strong>${record.hrMax ?? '—'}</strong><span class="unit">bpm</span></div>
      </div>`
          : ''
      }

      <section class="card">
        <h2>Questions</h2>
        <table class="breakdown">
          <thead><tr><th>Km</th><th>Category</th><th>Time</th><th>You said</th><th>Correct answer</th><th>Result</th><th>Points</th></tr></thead>
          <tbody>
            ${answerRowsMarkup(answers)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Cognitive profile</h2>
        <p class="hint">Your per-category score against our baseline population.</p>
        <ul class="percentiles">
          ${categories
            .map(
              (c) =>
                `<li><strong>${c.label}:</strong> ${
                  c.answered ? `${c.message} (${c.score} pts)` : 'not asked this run'
                }</li>`,
            )
            .join('')}
        </ul>
      </section>

      ${leaderboard ? leaderboardSection(record.points) : ''}

      <section class="card">
        <h2>Route</h2>
        <canvas id="route" class="chart"></canvas>
      </section>

      <section class="card">
        <h2>Speed profile</h2>
        <canvas id="speed" class="chart"></canvas>
      </section>

      ${footer}
    </main>
  `;
}

export function drawRunCharts(root, record) {
  const route = record.route ?? [];
  drawRoute(root.querySelector('#route'), route);
  drawSpeedProfile(root.querySelector('#speed'), route);
}

/** The post-run page. `newBests` come from `newPersonalBests` in progress.js. */
export function resultsMarkup(record, { historyHref = null, newBests = [] } = {}) {
  return runReportMarkup(record, {
    heading: 'Run complete',
    pbs: newBestsMarkup(newBests),
    leaderboard: true,
    footer: `
      <button class="primary" id="restart">New run</button>
      ${historyHref ? `<a class="hint history-link" href="${escapeHtml(historyHref)}">Saved to your history →</a>` : ''}`,
  });
}

/**
 * Render the post-run page. Returns `showNewBests(bests)` so the 'New PB!'
 * strip can be filled in once the earlier runs have loaded.
 */
export function renderResults(root, { record, onRestart, historyHref = null, newBests = [] }) {
  root.innerHTML = resultsMarkup(record, { historyHref, newBests });
  const page = root.querySelector('.run-report');
  drawRunCharts(root, record);
  root.querySelector('#restart').addEventListener('click', onRestart);
  return {
    showNewBests(bests) {
      if (!root.contains(page)) return;
      page.querySelector('.pb-slot').innerHTML = newBestsMarkup(bests);
    },
  };
}
