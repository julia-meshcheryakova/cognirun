import { CALIBRATION_CONDITIONS, calibrationDurationSec } from '../calibration.js';
import { MULTIPLIERS } from '../config.js';
import { formatClock } from '../format.js';
import { hrZone } from '../hrZones.js';

/** Markup of the calibration screen; exported so its mode-dependent parts can be tested. */
export function calibrationMarkup({ settings }) {
  return `
    <main class="screen calibration">
      <h1>Calibration</h1>
      <p class="lede">Hold each of the ${CALIBRATION_CONDITIONS.length} stages so CogniRun learns how
        your heart rate responds. The protocol takes ${formatClock(calibrationDurationSec())}${
          settings.demo ? ', accelerated at the demo speed' : ''
        }.</p>

      <div class="metric hero">
        <span class="label">Stage <span id="cal-step">1 of ${CALIBRATION_CONDITIONS.length}</span></span>
        <strong id="cal-stage">--</strong>
        <span class="unit" id="cal-instruction"></span>
        <span class="zone"><span id="cal-phase">Hold</span> · <span id="cal-countdown">--</span></span>
      </div>

      <div class="metric">
        <span class="label">Heart rate</span>
        <strong id="cal-hr">--</strong>
        <span class="unit" id="cal-zone">--</span>
        <span class="hr-source" id="cal-hr-source">${settings.demo ? 'Simulated' : 'Watch'}</span>
      </div>

      <div class="progress"><div class="progress-fill" id="cal-progress"></div></div>

      <ol class="stage-list" id="cal-list">
        ${CALIBRATION_CONDITIONS.map(
          (condition) => `
            <li data-stage="${condition.id}">
              <span class="stage-name">${condition.label}</span>
              <span class="stage-hold">${condition.holdSec}s</span>
            </li>`,
        ).join('')}
      </ol>

      ${
        settings.demo
          ? `<div class="row demo-controls">
        <span>Demo speed</span>
        <span class="multipliers">
          ${MULTIPLIERS.map(
            (m) =>
              `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
          ).join('')}
        </span>
      </div>`
          : ''
      }

      <button class="primary" id="cal-skip">Skip stage</button>
    </main>
  `;
}

const PROTOCOL_SEC = calibrationDurationSec();

/** Seconds of the protocol already behind the runner at this point of `state`. */
function protocolElapsedSec(state) {
  if (state.done) return PROTOCOL_SEC;
  const before = CALIBRATION_CONDITIONS.slice(0, state.index).reduce(
    (sum, c) => sum + c.restSec + c.holdSec,
    0,
  );
  return before + (state.phase === 'hold' ? state.condition.restSec : 0) + state.elapsedSec;
}

/**
 * The calibration screen. Progression lives in the session the caller drives;
 * this only paints the state it is handed.
 */
export function renderCalibration(root, { settings, onMultiplier, onSkip }) {
  root.innerHTML = calibrationMarkup({ settings });

  const el = (id) => root.querySelector(`#${id}`);

  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-mult]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onMultiplier(Number(btn.dataset.mult));
    }),
  );
  el('cal-skip').addEventListener('click', onSkip);

  const items = new Map(
    [...root.querySelectorAll('[data-stage]')].map((li) => [li.dataset.stage, li]),
  );

  return {
    /** `bpm` is the connected watch's reading; the simulated one is used without it. */
    update(state, { bpm } = {}) {
      const { condition, phase, remainingSec, index, total, completedIds, done } = state;
      el('cal-step').textContent = `${index + 1} of ${total}`;
      el('cal-stage').textContent = condition.label;
      el('cal-instruction').textContent =
        phase === 'rest' ? 'Rest before the final reading.' : condition.instruction;
      el('cal-phase').textContent = phase === 'rest' ? 'Resting' : 'Hold';
      el('cal-countdown').textContent = `${remainingSec}s left`;

      const reading = bpm || state.demoBpm;
      el('cal-hr').textContent = reading;
      const zone = hrZone(reading);
      el('cal-zone').textContent = `Zone ${zone.zone} · ${zone.name}`;
      el('cal-hr-source').textContent = bpm ? 'Watch' : 'Simulated';

      el('cal-progress').style.width = `${Math.min(100, (protocolElapsedSec(state) / PROTOCOL_SEC) * 100)}%`;

      items.forEach((li, id) => {
        li.classList.toggle('done', completedIds.includes(id));
        li.classList.toggle('current', !done && id === condition.id);
      });
    },
  };
}
