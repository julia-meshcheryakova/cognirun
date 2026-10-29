import { COURSES } from '../config.js';

/**
 * Settings: preferences that outlive a single run, plus the runner's data on
 * this device. Per-run choices (course for this run, demo mode) stay on the
 * Run tab.
 */
export function settingsMarkup({ settings, runCount = 0, version = '' }) {
  return `
    <main class="screen" id="settings-screen">
      <h1>Settings</h1>

      <section class="card compact">
        <h2>Run</h2>
        <label class="row">
          <span>Read questions aloud</span>
          <input type="checkbox" id="voice-toggle" ${settings.voice ? 'checked' : ''} />
        </label>
        <div class="row">
          <span>Default course</span>
          <span class="courses">
            ${Object.entries(COURSES)
              .map(
                ([id, c]) =>
                  `<button class="chip ${settings.course === id ? 'active' : ''}" data-default-course="${id}">${c.label}</button>`,
              )
              .join('')}
          </span>
        </div>
      </section>

      <section class="card compact">
        <h2>Your data</h2>
        <p class="hint" id="run-count">${runCount} run${runCount === 1 ? '' : 's'} saved on this device.</p>
        <div class="row">
          <button class="chip" id="export-runs" ${runCount ? '' : 'disabled'}>Export runs (JSON)</button>
          <button class="chip danger" id="clear-runs" ${runCount ? '' : 'disabled'}>Delete all runs</button>
        </div>
      </section>

      <p class="hint about">CogniRun ${version}</p>
    </main>`;
}

export async function renderSettings(root, { settings, store, onChange, version = '' }) {
  const runs = await store.list();
  root.innerHTML = settingsMarkup({ settings, runCount: runs.length, version });

  const voice = root.querySelector('#voice-toggle');
  voice.addEventListener('change', () => onChange({ voice: voice.checked }));
  root.querySelectorAll('[data-default-course]').forEach((btn) =>
    btn.addEventListener('click', () => onChange({ course: btn.dataset.defaultCourse })),
  );

  root.querySelector('#export-runs').addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(await store.list(), null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cognirun-runs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  root.querySelector('#clear-runs').addEventListener('click', async () => {
    if (!window.confirm('Delete every run saved on this device? This cannot be undone.')) return;
    for (const run of await store.list()) await store.remove(run.id);
    renderSettings(root, { settings, store, onChange, version });
  });
}
