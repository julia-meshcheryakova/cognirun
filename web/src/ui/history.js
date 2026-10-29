import { courseOf } from '../config.js';
import { escapeHtml, formatClock, formatKm } from '../format.js';

/**
 * Personal history. Placeholder list owned by the History & progress thread,
 * which replaces it with run detail and progress charts.
 */
export function historyMarkup(runs) {
  if (!runs.length) {
    return `
      <main class="screen">
        <h1>History</h1>
        <p class="lede">No runs yet. Finish a run and it shows up here.</p>
      </main>`;
  }
  return `
    <main class="screen">
      <h1>History</h1>
      <ul class="run-list">
        ${runs
          .map(
            (r) => `
          <li class="card run-item" data-run-id="${escapeHtml(r.id)}">
            <strong>${escapeHtml(courseOf(r.course).label)}${r.demo ? ' <small>demo</small>' : ''}</strong>
            <span>${escapeHtml(new Date(r.finishedAt).toLocaleString())}</span>
            <span>${formatKm(r.distanceM)} km · ${formatClock(r.durationS)} · ${r.correct}/${r.total} correct · <b class="run-points">${r.points}</b> pts</span>
          </li>`,
          )
          .join('')}
      </ul>
    </main>`;
}

export async function renderHistory(root, { store }) {
  const runs = await store.list();
  root.innerHTML = historyMarkup(runs);
}
