import { MULTIPLIERS } from '../config.js';

/** Markup of the setup screen; exported so its mode-dependent parts can be tested. */
export function setupMarkup({ settings }) {
  return `
    <main class="screen">
      <h1>CogniRun</h1>
      <p class="lede">Run 3 km. After every kilometer a lateral-thinking question pops up —
        answer fast for more points.</p>

      <section class="card">
        <div class="row">
          <span>Mode</span>
          <span class="modes">
            <button class="chip ${settings.demo ? 'active' : ''}" data-mode="demo">Demo</button>
            <button class="chip ${settings.demo ? '' : 'active'}" data-mode="live">Live run</button>
          </span>
        </div>
        <p class="hint">${
          settings.demo
            ? 'Demo simulates the run — no watch or GPS needed, and you can speed it up.'
            : 'Live run: GPS tracks the distance and the browser asks for a Bluetooth heart rate monitor when the run starts.'
        }</p>
      </section>

      <section class="card" id="speed-card" ${settings.demo ? '' : 'hidden'}>
        <div class="row">
          <span>Demo speed</span>
          <span class="multipliers">
            ${MULTIPLIERS.map(
              (m) =>
                `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
            ).join('')}
          </span>
        </div>
      </section>

      <section class="card">
        <label class="row">
          <span>Read questions aloud <small>your browser's built-in voice</small></span>
          <input type="checkbox" id="voice-toggle" ${settings.voice ? 'checked' : ''} />
        </label>
        <p class="hint">Answer by speaking: the microphone opens as soon as the question starts
          being read aloud. Your browser transcribes what you said and it is graded against the
          expected answer — typing still works if the mic is unavailable.</p>
        <p class="hint" id="hr-status" ${settings.demo ? 'hidden' : ''}>Real mode uses GPS and asks you to
          pick a Bluetooth heart rate monitor when the run starts. On a Garmin watch start
          <em>Broadcast heart rate</em> first (Menu → Sensors &amp; accessories → Wrist heart rate →
          Broadcast heart rate), then press Start here and choose the watch in the browser's
          Bluetooth dialog. Any BLE chest strap works too.</p>
      </section>

      <button class="primary" id="start">Start run</button>
    </main>
  `;
}

export function renderSetup(root, { settings, onChange, onStart }) {
  root.innerHTML = setupMarkup({ settings });

  root.querySelectorAll('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ demo: btn.dataset.mode === 'demo' })),
  );
  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ multiplier: Number(btn.dataset.mult) })),
  );
  const voiceToggle = root.querySelector('#voice-toggle');
  voiceToggle.addEventListener('change', () => onChange({ voice: voiceToggle.checked }));
  root.querySelector('#start').addEventListener('click', onStart);
}
