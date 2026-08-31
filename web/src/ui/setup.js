import { COURSES, DEFAULT_COURSE, MULTIPLIERS, courseOf } from '../config.js';
import { IDLE_DEVICES } from '../sensors/devices.js';

/** Device names and messages come from the browser, so they are never trusted here. */
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Watch panel: the live heart rate once paired, a connect button otherwise. */
function watchPanel(heartRate) {
  const connected = heartRate.state === 'connected';
  return `
    <div class="row">
      <span>Watch <small>heart rate over Bluetooth</small></span>
      ${
        connected
          ? `<strong class="device-value" id="watch-value">❤️ ${heartRate.bpm ?? '--'} bpm</strong>`
          : '<button class="chip" id="connect-watch">Connect Watch</button>'
      }
    </div>
    <p class="hint device-status" id="watch-status" data-state="${heartRate.state}">${escapeHtml(
      connected
        ? `${heartRate.name || 'Heart rate monitor'} connected`
        : heartRate.message ||
            'On a Garmin watch start Broadcast heart rate first (Menu → Sensors & accessories → Wrist heart rate → Broadcast heart rate). Any BLE chest strap works too.',
    )}</p>
  `;
}

/** GPS panel: tracking status once the watch is running, a connect button otherwise. */
function gpsPanel(gps) {
  const tracking = gps.state === 'live';
  // The watch is already running in these states, so there is nothing left to
  // connect — only a fix to wait for.
  const waiting = gps.state === 'waiting' || gps.state === 'no-signal';
  return `
    <div class="row">
      <span>GPS <small>distance from your location</small></span>
      ${
        tracking || waiting
          ? `<strong class="device-value" id="gps-value">${tracking ? '📍 GPS on' : '📍 …'}</strong>`
          : '<button class="chip" id="connect-gps">Connect GPS</button>'
      }
    </div>
    <p class="hint device-status" id="gps-status" data-state="${gps.state}">${escapeHtml(
      tracking
        ? `Location tracked · ${gps.message}`
        : gps.message || 'Grant location access to track the route.',
    )}</p>
  `;
}

/** Markup of the setup screen; exported so its mode-dependent parts can be tested. */
export function setupMarkup({ settings, devices = IDLE_DEVICES }) {
  const course = courseOf(settings.course);
  return `
    <main class="screen">
      <h1>CogniRun</h1>
      <p class="lede">Run ${course.label}. After every ${course.segment} m a lateral-thinking question pops up —
        answer fast for more points.</p>

      <section class="card" id="devices-card">
        ${watchPanel(devices.heartRate)}
        ${gpsPanel(devices.gps)}
      </section>

      <section class="card" id="course-card" ${settings.demo ? 'hidden' : ''}>
        <div class="row">
          <span>Course</span>
          <span class="courses">
            ${Object.entries(COURSES)
              .map(
                ([id, c]) =>
                  `<button class="chip ${(settings.course ?? DEFAULT_COURSE) === id ? 'active' : ''}" data-course="${id}">${c.label}</button>`,
              )
              .join('')}
          </span>
        </div>
        <p class="hint">60 m is a walkable test course — a question every 20 m so you can finish a full run on foot.</p>
      </section>

      <section class="card">
        <label class="row">
          <span>Read questions aloud <small>your browser's built-in voice</small></span>
          <input type="checkbox" id="voice-toggle" ${settings.voice ? 'checked' : ''} />
        </label>
        <p class="hint">Answer by speaking: the microphone opens once the question finishes
          being read aloud. Your browser transcribes what you said and it is graded against the
          expected answer — typing still works if the mic is unavailable.</p>
      </section>

      <section class="card">
        <label class="row">
          <span>Demo mode <small>simulate the run instead of using your watch/GPS</small></span>
          <input type="checkbox" id="demo-toggle" ${settings.demo ? 'checked' : ''} />
        </label>
        <p class="hint">${
          settings.demo
            ? 'Demo simulates the run — connecting a watch or GPS above is optional, and you can speed it up.'
            : 'Live run: connect your watch and GPS above. Both are optional, and nothing is asked for again once the run starts.'
        }</p>
        <div class="row" id="speed-row" ${settings.demo ? '' : 'hidden'}>
          <span>Demo speed</span>
          <span class="multipliers">
            ${MULTIPLIERS.map(
              (m) =>
                `<button class="chip ${m === settings.multiplier ? 'active' : ''}" data-mult="${m}">x${m}</button>`,
            ).join('')}
          </span>
        </div>
      </section>

      <button class="primary" id="start">Start run</button>
    </main>
  `;
}

export function renderSetup(
  root,
  { settings, devices = IDLE_DEVICES, onChange, onStart, onConnectWatch, onConnectGps },
) {
  root.innerHTML = setupMarkup({ settings, devices });

  root.querySelectorAll('[data-mult]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ multiplier: Number(btn.dataset.mult) })),
  );
  root.querySelectorAll('[data-course]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ course: btn.dataset.course })),
  );
  const voiceToggle = root.querySelector('#voice-toggle');
  voiceToggle.addEventListener('change', () => onChange({ voice: voiceToggle.checked }));
  const demoToggle = root.querySelector('#demo-toggle');
  demoToggle.addEventListener('change', () => onChange({ demo: demoToggle.checked }));
  root.querySelector('#start').addEventListener('click', onStart);

  const card = root.querySelector('#devices-card');
  function bindConnects() {
    // Both connections need the click's user activation.
    card.querySelector('#connect-watch')?.addEventListener('click', onConnectWatch);
    card.querySelector('#connect-gps')?.addEventListener('click', onConnectGps);
  }
  bindConnects();

  return {
    /** Repaint the device panels as connections come and go, and on every beat. */
    updateDevices(deviceState) {
      card.innerHTML = `${watchPanel(deviceState.heartRate)}${gpsPanel(deviceState.gps)}`;
      bindConnects();
    },
  };
}
