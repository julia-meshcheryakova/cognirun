import { MULTIPLIERS } from '../config.js';

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
        <label class="row">
          <span>Read questions aloud <small>ElevenLabs voice when a key is configured,
            otherwise your browser's voice</small></span>
          <input type="checkbox" id="voice-toggle" ${settings.voice ? 'checked' : ''} />
        </label>
        <p class="hint" id="hr-status" ${settings.demo ? 'hidden' : ''}>Real mode uses GPS and asks you to
          pick a Bluetooth heart rate monitor (Garmin watch broadcasting HR, or any BLE strap) when the run starts.</p>
      </section>

      <button class="primary" id="start">Start run</button>
    </main>
  `;

  const demoToggle = root.querySelector('#demo-toggle');
  demoToggle.addEventListener('change', () => onChange({ demo: demoToggle.checked }));
  const voiceToggle = root.querySelector('#voice-toggle');
  voiceToggle.addEventListener('change', () => onChange({ voice: voiceToggle.checked }));
  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ multiplier: Number(btn.dataset.mult) })),
  );
  root.querySelector('#start').addEventListener('click', onStart);
}
