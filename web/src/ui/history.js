import { COURSES } from '../config.js';
import { escapeHtml, formatClock, formatKm } from '../format.js';
import { filterRuns } from '../history/store.js';
import { countedRuns, personalBests, progressSummary } from '../progress.js';
import { routeHref } from './nav.js';
import { drawProgressCharts, progressOverviewMarkup } from './progressOverview.js';
import { renderRunDetail } from './runDetail.js';
import { courseLabel, formatDate, runBadgesMarkup } from './runFormat.js';

/**
 * Personal history (`#/history`): progress overview, then every saved run with
 * course filter chips and a demo toggle. `#/history/<id>` shows one run.
 */

/** Filter state survives tab switches for the session. */
const view = { course: null, showDemo: true };

function filtersMarkup(runs, { course, showDemo }) {
  const courses = Object.keys(COURSES).filter((c) => runs.some((r) => r.course === c));
  const chip = (id, label) =>
    `<button class="chip${(course ?? '') === id ? ' active' : ''}" data-course="${id}" aria-pressed="${(course ?? '') === id}">${label}</button>`;
  const hasDemo = runs.some((r) => r.demo);
  return `
      <div class="history-filters">
        <div class="courses" role="group" aria-label="Course">
          ${chip('', 'All')}
          ${courses.map((c) => chip(c, escapeHtml(COURSES[c].label))).join('')}
        </div>
        ${
          hasDemo
            ? `<label class="demo-toggle"><input type="checkbox" id="show-demo"${showDemo ? ' checked' : ''}> Show demo runs</label>`
            : ''
        }
      </div>`;
}

function runItemMarkup(r, pbRunIds) {
  return `
          <li class="card run-item${r.demo ? ' demo' : ''}" data-run-id="${escapeHtml(r.id)}">
            <a class="run-link" href="${escapeHtml(routeHref('history', r.id))}">
              <span class="run-title"><strong>${courseLabel(r)}</strong>${runBadgesMarkup(r)}${
                pbRunIds.has(r.id) ? '<span class="badge pb" title="Holds a personal best">🏆 PB</span>' : ''
              }<span class="chevron" aria-hidden="true">›</span></span>
              <span class="run-date">${escapeHtml(formatDate(r.finishedAt))}</span>
              <span class="run-stats">${formatKm(r.distanceM)} km · ${formatClock(r.durationS)} · ${r.correct}/${r.total} correct · <b class="run-points">${r.points}</b> pts</span>
            </a>
          </li>`;
}

/**
 * @param {object[]} runs every saved run, newest first (demo included)
 * @param {{ course?: string|null, showDemo?: boolean, now?: number }} [options]
 */
export function historyMarkup(runs, { course = null, showDemo = true, now = Date.now() } = {}) {
  if (!runs.length) {
    return `
      <main class="screen history-screen empty">
        <h1>History</h1>
        <p class="lede">No runs yet. Finish a run and it shows up here, with your personal bests, streak and progress per category.</p>
        <a class="primary start-link" href="${routeHref('run')}">Start a run</a>
      </main>`;
  }
  const activeCourse = course && runs.some((r) => r.course === course) ? course : null;
  const scope = activeCourse ?? undefined;
  const summary = progressSummary(runs, { course: scope, now });
  const pbRunIds = new Set(
    personalBests(countedRuns(runs)).flatMap((b) => [b.points?.runId, b.fastest?.runId, b.accuracy?.runId]),
  );
  const listed = filterRuns(runs, { includeDemo: showDemo, course: scope });
  const hiddenDemo = filterRuns(runs, { course: scope }).length - listed.length;

  return `
    <main class="screen history-screen">
      <h1>History</h1>
      ${filtersMarkup(runs, { course: activeCourse, showDemo })}
      ${progressOverviewMarkup(summary, { demoOnly: runs.every((r) => r.demo) })}
      <section class="runs">
        <h2>Runs · ${listed.length}</h2>
        ${
          listed.length
            ? `<ul class="run-list">${listed.map((r) => runItemMarkup(r, pbRunIds)).join('')}</ul>`
            : '<p class="hint">No runs match this filter.</p>'
        }
        ${hiddenDemo ? `<p class="hint">${hiddenDemo} demo run${hiddenDemo === 1 ? '' : 's'} hidden.</p>` : ''}
      </section>
    </main>`;
}

function renderList(root, runs) {
  const summaryOptions = { course: view.course, showDemo: view.showDemo };
  root.innerHTML = historyMarkup(runs, summaryOptions);
  const scope = runs.some((r) => r.course === view.course) ? view.course : undefined;
  drawProgressCharts(root, progressSummary(runs, { course: scope }));

  root.querySelectorAll('.history-filters [data-course]').forEach((button) => {
    button.addEventListener('click', () => {
      view.course = button.dataset.course || null;
      renderList(root, runs);
    });
  });
  root.querySelector('#show-demo')?.addEventListener('change', (event) => {
    view.showDemo = event.target.checked;
    renderList(root, runs);
  });
}

let renderToken = 0;
let unsubscribe = null;

function stopWatching() {
  unsubscribe?.();
  unsubscribe = null;
}

export async function renderHistory(root, { store, params = [] }) {
  const token = ++renderToken;
  stopWatching();
  const before = root.firstElementChild;
  const runs = await store.list();
  // Another screen took over while the runs were loading.
  if (token !== renderToken || root.firstElementChild !== before) return;

  const [id] = params;
  if (id) {
    renderRunDetail(root, {
      record: runs.find((r) => r.id === id) ?? null,
      runs,
      async onDelete() {
        stopWatching();
        await store.remove(id);
        location.hash = routeHref('history');
      },
    });
  } else {
    renderList(root, runs);
  }

  // Re-render when runs change underneath (e.g. account sync) while on screen.
  unsubscribe = store.subscribe(() => {
    if (token !== renderToken) return;
    if (!root.querySelector('.history-screen, .run-detail')) return stopWatching();
    renderHistory(root, { store, params });
  });
}
