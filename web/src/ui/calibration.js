import { CALIBRATION_CONDITIONS, calibrationDurationSec } from '../calibration.js';
import { MULTIPLIERS } from '../config.js';
import { formatClock } from '../format.js';

/**
 * The calibration screen: shows the condition the runner is holding now, what is
 * left of the protocol, and lets a demo run skip ahead or change the speed.
 * All progression lives in the session passed to `update`.
 */
export function renderCalibration(root, { settings, onMultiplier, onSkip }) {
  root.innerHTML = `
    <main class="screen calibration">
      <h1>Calibration</h1>
      <p class="lede">Hold each condition so CogniRun can learn how your heart rate responds
        before the run. The whole protocol takes ${formatClock(calibrationDurationSec())}${
          settings.demo ? ', accelerated in demo mode' : ''
        }.</p>

      <div class="metric hero">
        <span class="label">Now · <span id="cal-step">1 of ${CALIBRATION_CONDITIONS.length}</span></span>
        <strong id="cal-label">--</strong>
        <span class="unit" id="cal-instruction"></span>
        <span class="zone"><span id="cal-phase">Hold</span> · <span id="cal-countdown">--</span></span>
      </div>

      <div class="progress"><div class="progress-fill" id="cal-progress"></div></div>

      <ol class="condition-list" id="cal-list">
        ${CALIBRATION_CONDITIONS.map(
          (condition) => `
            <li data-condition="${condition.id}">
              <span class="condition-name">${condition.label}</span>
              <span class="condition-hold">${condition.holdSec}s</span>
            </li>`,
        ).join('')}
      </ol>

      <div class="row demo-controls" ${settings.demo ? '' : 'hidden'}>
        <span>Demo speed</span>
        <span class="multipliers">
          ${MULTIPLIERS.map(
            (m) =>
              `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
          ).join('')}
        </span>
      </div>

      <button class="primary" id="cal-skip" ${settings.demo ? '' : 'hidden'}>Skip condition</button>
    </main>
  `;

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
    [...root.querySelectorAll('[data-condition]')].map((li) => [li.dataset.condition, li]),
  );

  return {
    update(state) {
      const { condition, phase, remainingSec, index, total, completedIds } = state;
      el('cal-step').textContent = `${Math.min(index + 1, total)} of ${total}`;
      el('cal-label').textContent = condition.label;
      el('cal-instruction').textContent =
        phase === 'rest' ? 'Rest before the final reading.' : condition.instruction;
      el('cal-phase').textContent = phase === 'rest' ? 'Resting' : 'Hold';
      el('cal-countdown').textContent = `${remainingSec}s left`;

      const protocolSec = calibrationDurationSec();
      const doneSec =
        CALIBRATION_CONDITIONS.slice(0, index).reduce((sum, c) => sum + c.restSec + c.holdSec, 0) +
        (phase === 'hold' ? condition.restSec : 0) +
        state.elapsedSec;
      el('cal-progress').style.width = `${Math.min(100, (doneSec / protocolSec) * 100)}%`;

      items.forEach((li, id) => {
        li.classList.toggle('done', completedIds.includes(id));
        li.classList.toggle('current', !state.done && id === condition.id);
      });
    },
  };
}
