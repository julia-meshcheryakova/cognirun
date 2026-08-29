import { MULTIPLIERS } from '../config.js';
import { formatClock, formatKm, formatPace } from '../format.js';
import { hrZone } from '../hrZones.js';
import { QUESTION_COUNT, RUN_DISTANCE_METERS } from '../run.js';

export function renderLive(root, { settings, onMultiplier, onScrub }) {
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

      <div class="scrubber" ${settings.demo ? '' : 'hidden'}>
        <div class="row">
          <span>Demo timeline</span>
          <strong id="scrub-value">0.00 km</strong>
        </div>
        <input id="scrub" type="range" min="0" max="${RUN_DISTANCE_METERS}" step="10" value="0" />
        <div class="scrubber-ticks">
          ${[0, 1, 2, 3].map((km) => `<span>${km} km</span>`).join('')}
        </div>
      </div>
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

  // Demo scrubber: drag to fast-forward the run. Dragging backwards does nothing
  // (a run cannot rewind), so the thumb just snaps back to the live distance.
  const scrub = el('scrub');
  let dragging = false;
  if (settings.demo) {
    scrub.addEventListener('input', () => {
      dragging = true;
      el('scrub-value').textContent = `${formatKm(scrub.value)} km`;
    });
    scrub.addEventListener('change', () => {
      dragging = false;
      onScrub(Number(scrub.value));
    });
  }

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
      if (settings.demo && !dragging) {
        scrub.value = snapshot.distance;
        el('scrub-value').textContent = `${formatKm(snapshot.distance)} km`;
      }
    },
  };
}
