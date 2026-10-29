import { drawSparkline } from '../charts.js';
import { escapeHtml, formatKm } from '../format.js';
import { routeHref } from './nav.js';
import {
  formatDuration,
  formatPaceSeconds,
  formatPbValue,
  formatPercent,
} from './runFormat.js';

/**
 * The progress overview at the top of History: totals, streak, personal bests,
 * category accuracy (overall and per week) and the points/pace trend. Takes a
 * `progressSummary()` result; charts are drawn by `drawProgressCharts`.
 */

function metric(key, label, value, unit = '') {
  return `<div class="metric" data-total="${key}"><span class="label">${label}</span><strong>${value}</strong>${
    unit ? `<span class="unit">${unit}</span>` : ''
  }</div>`;
}

function streakMarkup({ current, longest, thisWeek }) {
  const text = current
    ? `<strong>${current}-week streak</strong>${thisWeek ? '' : ' · run this week to keep it'}`
    : '<strong>No streak yet</strong> · one run a week starts one';
  return `<p class="streak" data-current="${current}" data-longest="${longest}"><span aria-hidden="true">🔥</span> ${text}<span class="streak-best">longest ${longest} wk</span></p>`;
}

function pbCell(kind, pb) {
  if (!pb) return '<td>—</td>';
  return `<td><a href="${escapeHtml(routeHref('history', pb.runId))}">${formatPbValue(kind, pb.value)}</a></td>`;
}

function bestsMarkup(bests) {
  return `
      <section class="card bests">
        <h2>Personal bests</h2>
        <table class="breakdown pb-table">
          <thead><tr><th>Course</th><th>Points</th><th>Time</th><th>Accuracy</th></tr></thead>
          <tbody>
            ${bests
              .map(
                (b) =>
                  `<tr data-course="${escapeHtml(b.course)}"><td>${escapeHtml(b.label)} <small>${b.runs}×</small></td>${pbCell('points', b.points)}${pbCell('time', b.fastest)}${pbCell('accuracy', b.accuracy)}</tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <p class="hint">Fastest time counts only runs that covered the whole course.</p>
      </section>`;
}

function categoryBarsMarkup(categories) {
  return `<ul class="category-bars">
          ${categories
            .map((c) => {
              const pct = c.accuracy === null ? 0 : Math.round(c.accuracy * 100);
              return `<li data-category="${c.category}">
            <span class="cat-label">${escapeHtml(c.label)}</span>
            <span class="bar" role="img" aria-label="${escapeHtml(c.label)} accuracy ${formatPercent(c.accuracy)}"><span class="bar-fill" style="width:${pct}%"></span></span>
            <span class="cat-value">${formatPercent(c.accuracy)}</span>
            <small class="cat-detail">${c.graded ? `${c.correct}/${c.graded} right` : 'not asked yet'}${
              c.avgTimeS === null ? '' : ` · ${c.avgTimeS.toFixed(1)}s avg`
            }</small>
          </li>`;
            })
            .join('')}
        </ul>`;
}

/** Accuracy heat grid: one row per category, one column per ISO week. */
function weeklyGridMarkup(weekly) {
  if (!weekly.length || !weekly.some((w) => w.runs)) return '';
  const header = weekly.map((w) => `<th scope="col" title="${w.week}">${w.week.slice(-3)}</th>`).join('');
  const rows = weekly[0].categories
    .map(
      (c, i) =>
        `<tr data-category="${c.category}"><th scope="row">${escapeHtml(c.label)}</th>${weekly
          .map((w) => {
            const cell = w.categories[i];
            if (cell.accuracy === null) return '<td class="empty">·</td>';
            const alpha = (0.12 + cell.accuracy * 0.5).toFixed(2);
            return `<td style="background:rgba(46,230,197,${alpha})" title="${w.week}: ${cell.correct}/${cell.graded}, ${
              cell.avgTimeS === null ? '—' : `${cell.avgTimeS.toFixed(1)}s avg`
            }">${Math.round(cell.accuracy * 100)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `
        <h3 class="subhead">Weekly accuracy %</h3>
        <table class="weekly-grid">
          <thead><tr><th></th>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
}

function trendMarkup(trend) {
  if (trend.length < 2) {
    return `
      <section class="card trend">
        <h2>Trend</h2>
        <p class="hint">Finish two runs to see your points and pace trend.</p>
      </section>`;
  }
  return `
      <section class="card trend">
        <h2>Trend · last ${trend.length} runs</h2>
        <div class="spark"><span class="label">Points</span><canvas class="sparkline" id="trend-points" aria-label="Points over your last ${trend.length} runs"></canvas></div>
        <div class="spark"><span class="label">Pace</span><canvas class="sparkline" id="trend-pace" aria-label="Pace over your last ${trend.length} runs"></canvas></div>
      </section>`;
}

/**
 * @param {ReturnType<import('../progress.js').progressSummary>} summary
 * @param {{ demoOnly?: boolean }} [options] demoOnly: every saved run is a demo run
 */
export function progressOverviewMarkup(summary, { demoOnly = false } = {}) {
  if (!summary.runs.length) {
    return `
      <section class="card progress-overview empty">
        <h2>Progress</h2>
        <p class="lede">${
          demoOnly
            ? 'Only demo runs so far. Demo runs are saved but never count toward your progress — go for a real run!'
            : 'No runs to count here yet.'
        }</p>
      </section>`;
  }
  const t = summary.totals;
  return `
      <section class="card progress-overview">
        <h2>Progress</h2>
        <div class="grid totals">
          ${metric('runs', 'Runs', t.runs)}
          ${metric('distance', 'Distance', formatKm(t.distanceM), 'km')}
          ${metric('time', 'Time', formatDuration(t.durationS))}
          ${metric('points', 'Points', t.points)}
        </div>
        ${streakMarkup(summary.streak)}
        <p class="hint">Demo runs never count toward progress.</p>
      </section>
      ${bestsMarkup(summary.bests)}
      <section class="card categories">
        <h2>Category accuracy</h2>
        ${categoryBarsMarkup(summary.categories)}
        ${weeklyGridMarkup(summary.weekly)}
      </section>
      ${trendMarkup(summary.trend)}`;
}

export function drawProgressCharts(root, summary) {
  const points = root.querySelector('#trend-points');
  const pace = root.querySelector('#trend-pace');
  if (points) drawSparkline(points, summary.trend.map((t) => t.points), { color: '#2ee6c5' });
  if (pace) {
    drawSparkline(
      pace,
      summary.trend.map((t) => t.paceSPerKm),
      { color: '#f5a524', lowerIsBetter: true, format: (s) => formatPaceSeconds(s).replace(' /km', '') },
    );
  }
}
