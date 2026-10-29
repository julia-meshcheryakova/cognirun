import { escapeHtml } from '../format.js';
import { bestsHeldBy } from '../progress.js';
import { routeHref } from './nav.js';
import { drawRunCharts, runReportMarkup } from './results.js';
import { courseLabel, formatDate, heldBestsMarkup, runBadgesMarkup } from './runFormat.js';

/** `#/history/<id>`: one stored run, rendered with the shared results renderer. */

const backLink = `<a class="back-link" href="${routeHref('history')}">← History</a>`;

export function runDetailMarkup(record, { runs = [] } = {}) {
  return runReportMarkup(record, {
    className: 'run-detail',
    top: backLink,
    heading: `${courseLabel(record)} run`,
    meta: `<p class="run-meta"><span class="run-date">${escapeHtml(formatDate(record.finishedAt))}</span>${runBadgesMarkup(record)}</p>`,
    pbs: heldBestsMarkup(record, bestsHeldBy(record, runs)),
    footer: `
      <div class="danger-zone">
        <button class="danger" id="delete-run">Delete run</button>
        <div class="confirm-delete" id="delete-confirm" hidden>
          <p>Delete this run for good? It cannot be undone.</p>
          <div class="confirm-actions">
            <button class="danger" id="confirm-delete">Delete</button>
            <button class="chip" id="cancel-delete">Cancel</button>
          </div>
        </div>
      </div>
      ${backLink}`,
  });
}

export function runNotFoundMarkup() {
  return `
    <main class="screen run-detail missing">
      ${backLink}
      <h1>Run not found</h1>
      <p class="lede">This run is not on this device any more.</p>
    </main>`;
}

/**
 * @param {HTMLElement} root
 * @param {{ record: object|null, runs: object[], onDelete: () => Promise<void> }} options
 */
export function renderRunDetail(root, { record, runs, onDelete }) {
  if (!record) {
    root.innerHTML = runNotFoundMarkup();
    return;
  }
  root.innerHTML = runDetailMarkup(record, { runs });
  drawRunCharts(root, record);

  const ask = root.querySelector('#delete-run');
  const confirm = root.querySelector('#delete-confirm');
  ask.addEventListener('click', () => {
    ask.hidden = true;
    confirm.hidden = false;
    root.querySelector('#cancel-delete').focus();
  });
  root.querySelector('#cancel-delete').addEventListener('click', () => {
    confirm.hidden = true;
    ask.hidden = false;
  });
  root.querySelector('#confirm-delete').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    await onDelete();
  });
}
