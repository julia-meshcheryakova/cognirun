import { CALIBRATION_CONDITIONS, calibrationDurationSec } from '../calibration.js';
import { MULTIPLIERS } from '../config.js';
import { formatClock } from '../format.js';

export function renderSetup(root, { settings, onChange, onStart }) {
  root.innerHTML = `
    <main class="screen">
      <h1>CogniRun</h1>
      <p class="lede">Run 3 km. After every kilometer a lateral-thinking question pops up —
        answer fast for more points.</p>

      <section class="card">
        <label class="row">
          <span>Demo mode <small>simulate the run, no watch or GPS needed</small></span>
          <input type="checkbox" id="demo-toggle" ${settings.demo ? 'checked' : ''} />
        </label>
        <label class="row" id="speed-row" ${settings.demo ? '' : 'hidden'}>
          <span>Demo speed</span>
          <span class="multipliers">
            ${MULTIPLIERS.map(
              (m) =>
                `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
            ).join('')}
          </span>
        </label>
        <label class="row" id="calibrate-row" ${settings.demo ? '' : 'hidden'}>
          <span>Calibrate first <small>hold ${CALIBRATION_CONDITIONS.length} conditions
            (${formatClock(calibrationDurationSec())}, accelerated by the demo speed)</small></span>
          <input type="checkbox" id="calibrate-toggle" ${settings.calibrate ? 'checked' : ''} />
        </label>
        <ol class="condition-list" id="calibrate-preview" ${settings.demo && settings.calibrate ? '' : 'hidden'}>
          ${CALIBRATION_CONDITIONS.map(
            (condition) =>
              `<li><span class="condition-name">${condition.label}</span><span class="condition-hold">${condition.holdSec}s</span></li>`,
          ).join('')}
        </ol>
        <label class="row">
          <span>Read questions aloud <small>ElevenLabs voice when a key is configured,
            otherwise your browser's voice</small></span>
          <input type="checkbox" id="voice-toggle" ${settings.voice ? 'checked' : ''} />
        </label>
        <p class="hint">Answer by speaking: the microphone opens as soon as the question starts
          being read aloud. Your answer is transcribed and graded (exact match first, then an
          LLM judge) — typing still works if the mic is unavailable.</p>
        <p class="hint" id="hr-status" ${settings.demo ? 'hidden' : ''}>Real mode uses GPS and asks you to
          pick a Bluetooth heart rate monitor when the run starts. On a Garmin watch start
          <em>Broadcast heart rate</em> first (Menu → Sensors &amp; accessories → Wrist heart rate →
          Broadcast heart rate), then press Start here and choose the watch in the browser's
          Bluetooth dialog. Any BLE chest strap works too.</p>
      </section>

      <button class="primary" id="start">Start run</button>
    </main>
  `;

  const demoToggle = root.querySelector('#demo-toggle');
  demoToggle.addEventListener('change', () => onChange({ demo: demoToggle.checked }));
  const calibrateToggle = root.querySelector('#calibrate-toggle');
  calibrateToggle.addEventListener('change', () => onChange({ calibrate: calibrateToggle.checked }));
  const voiceToggle = root.querySelector('#voice-toggle');
  voiceToggle.addEventListener('change', () => onChange({ voice: voiceToggle.checked }));
  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ multiplier: Number(btn.dataset.mult) })),
  );
  root.querySelector('#start').addEventListener('click', onStart);
}
