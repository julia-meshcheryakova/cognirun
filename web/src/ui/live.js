import { MULTIPLIERS } from '../config.js';
import { formatClock, formatKm, formatPace } from '../format.js';
import { hrZone } from '../hrZones.js';
import { QUESTION_COUNT, RUN_DISTANCE_METERS } from '../run.js';

export function renderLive(root, { settings, onMultiplier }) {
  root.innerHTML = `
    <main class="screen live">
      <div class="metric hero">
        <span class="label">Heart rate</span>
        <strong id="hr">--</strong>
        <span class="unit">bpm</span>
        <span class="zone" id="zone">--</span>
      </div>

      <div class="metric hero points">
        <span class="label">Points</span>
        <strong id="points">0</strong>
        <span class="unit" id="answered">0 / ${QUESTION_COUNT} questions</span>
      </div>

      <div class="grid">
        <div class="metric"><span class="label">Distance</span><strong id="distance">0.00</strong><span class="unit">km of ${RUN_DISTANCE_METERS / 1000}</span></div>
        <div class="metric"><span class="label">Pace</span><strong id="pace">--:--</strong></div>
        <div class="metric"><span class="label">Time</span><strong id="time">0:00</strong></div>
      </div>

      <div class="progress"><div class="progress-fill" id="progress"></div></div>

      <div class="row demo-controls" ${settings.demo ? '' : 'hidden'}>
        <span>Demo speed</span>
        <span class="multipliers">
          ${MULTIPLIERS.map(
            (m) =>
              `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
          ).join('')}
        </span>
      </div>

      <div id="question-slot"></div>
    </main>
  `;

  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-mult]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onMultiplier(Number(btn.dataset.mult));
    }),
  );

  const el = (id) => root.querySelector(`#${id}`);

  return {
    questionSlot: el('question-slot'),
    update(snapshot, { points, answered }) {
      const zone = hrZone(snapshot.heartRate || 0);
      el('hr').textContent = snapshot.heartRate || '--';
      el('zone').textContent = snapshot.heartRate ? `Zone ${zone.zone} · ${zone.name}` : '--';
      el('points').textContent = points;
      el('answered').textContent = `${answered} / ${QUESTION_COUNT} questions`;
      el('distance').textContent = formatKm(snapshot.distance);
      el('pace').textContent = formatPace(snapshot.speed);
      el('time').textContent = formatClock(snapshot.elapsedSeconds);
      el('progress').style.width = `${Math.min(100, (snapshot.distance / RUN_DISTANCE_METERS) * 100)}%`;
    },
  };
}
