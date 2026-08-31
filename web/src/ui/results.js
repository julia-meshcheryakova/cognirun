import { drawRoute, drawSpeedProfile } from '../charts.js';
import { escapeHtml } from '../format.js';
import { formatClock, formatKm, formatPace, formatSpeed } from '../format.js';
import { leaderboardSection } from '../leaderboard.js';
import { categoryBreakdown } from '../percentile.js';
import { CATEGORY_LABELS } from '../questions.js';

function verdictLabel(answer) {
  if (answer.correct === null || answer.correct === undefined) return '—';
  const how = answer.spoken ? 'spoken' : 'typed';
  return `${answer.correct ? 'correct' : 'wrong'} · ${how}`;
}

export function renderResults(root, { snapshot, answers, onRestart }) {
  const totalPoints = answers.reduce((sum, a) => sum + a.points, 0);
  const categories = categoryBreakdown(answers);
  const avgSpeed = snapshot.elapsedSeconds ? snapshot.distance / snapshot.elapsedSeconds : 0;

  root.innerHTML = `
    <main class="screen">
      <h1>Run complete</h1>

      <div class="metric hero points">
        <span class="label">Total points</span>
        <strong>${totalPoints}</strong>
      </div>

      <div class="grid">
        <div class="metric"><span class="label">Distance</span><strong>${formatKm(snapshot.distance)}</strong><span class="unit">km</span></div>
        <div class="metric"><span class="label">Time</span><strong>${formatClock(snapshot.elapsedSeconds)}</strong></div>
        <div class="metric"><span class="label">Avg pace</span><strong>${formatPace(avgSpeed)}</strong><span class="unit">${formatSpeed(avgSpeed)}</span></div>
      </div>

      <section class="card">
        <h2>Questions</h2>
        <table class="breakdown">
          <thead><tr><th>Km</th><th>Category</th><th>Time</th><th>You said</th><th>Answer</th><th>Points</th></tr></thead>
          <tbody>
            ${answers
              .map(
                (a) =>
                  `<tr><td>${a.kilometer}</td><td>${CATEGORY_LABELS[a.category] ?? '—'}</td><td>${a.elapsedSeconds.toFixed(1)}s</td><td>${a.text ? escapeHtml(a.text) : '(no answer)'}</td><td>${verdictLabel(a)}</td><td>${a.points}</td></tr>`,
              )
              .join('')}
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

      ${leaderboardSection(totalPoints)}

      <section class="card">
        <h2>Route</h2>
        <canvas id="route" class="chart"></canvas>
      </section>

      <section class="card">
        <h2>Speed profile</h2>
        <canvas id="speed" class="chart"></canvas>
      </section>

      <button class="primary" id="restart">New run</button>
    </main>
  `;

  drawRoute(root.querySelector('#route'), snapshot.samples);
  drawSpeedProfile(root.querySelector('#speed'), snapshot.samples);
  root.querySelector('#restart').addEventListener('click', onRestart);
}
