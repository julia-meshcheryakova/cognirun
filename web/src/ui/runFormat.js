import { courseOf } from '../config.js';
import { escapeHtml, formatClock } from '../format.js';
import { PB_LABELS } from '../progress.js';

/** Display helpers shared by the History, run detail and results screens. */

export function formatDate(iso, { withTime = true } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime
    ? `${day} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : day;
}

/** '42:05' under an hour, '1h 05m' above. */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  if (s < 3600) return formatClock(s);
  const hours = Math.floor(s / 3600);
  return `${hours}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function formatPaceSeconds(secondsPerKm) {
  return Number.isFinite(secondsPerKm) && secondsPerKm > 0 ? `${formatClock(secondsPerKm)} /km` : '--:--';
}

export function formatPercent(share) {
  return Number.isFinite(share) ? `${Math.round(share * 100)}%` : '—';
}

export function formatPbValue(kind, value) {
  if (value === null || value === undefined) return '—';
  if (kind === 'time') return formatClock(value);
  if (kind === 'accuracy') return formatPercent(value);
  return String(value);
}

/** Course label plus the demo / challenge badges a run carries. */
export function runBadgesMarkup(run) {
  return [
    run.demo ? '<span class="badge demo">demo</span>' : '',
    run.challengeId
      ? `<span class="badge challenge">Challenge ${escapeHtml(String(run.challengeId))}</span>`
      : '',
  ].join('');
}

export function courseLabel(run) {
  return escapeHtml(courseOf(run.course).label);
}

/** 'New PB!' strip for a just-finished run; empty when it set none. */
export function newBestsMarkup(newBests = []) {
  if (!newBests.length) return '';
  return `
      <div class="pb-badges new" role="status">
        <span class="badge pb">New PB!</span>
        ${newBests
          .map(
            (pb) =>
              `<span class="pb-item" data-pb="${pb.kind}">${PB_LABELS[pb.kind]} ${formatPbValue(pb.kind, pb.value)}${
                pb.previous === null || pb.previous === undefined
                  ? ''
                  : ` <small>was ${formatPbValue(pb.kind, pb.previous)}</small>`
              }</span>`,
          )
          .join('')}
      </div>`;
}

/** The course PBs a stored run still holds, e.g. on the run detail page. */
export function heldBestsMarkup(run, kinds = []) {
  if (!kinds.length) return '';
  return `
      <div class="pb-badges held">
        <span class="badge pb">🏆 ${courseLabel(run)} PB</span>
        ${kinds.map((kind) => `<span class="pb-item" data-pb="${kind}">${PB_LABELS[kind]}</span>`).join('')}
      </div>`;
}
