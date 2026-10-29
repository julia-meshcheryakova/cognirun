import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, sanitizeSettings, saveSettings } from '../src/settings.js';
import { settingsMarkup } from '../src/ui/settings.js';
import { TABS } from '../src/ui/nav.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

test('settings round-trip through storage', () => {
  const storage = memory();
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  saveSettings({ demo: true, multiplier: 100, voice: false, course: '10k' }, storage);
  assert.deepEqual(loadSettings(storage), { demo: true, multiplier: 100, voice: false, course: '10k' });
});

test('invalid or corrupt settings fall back to defaults', () => {
  assert.deepEqual(
    sanitizeSettings({ demo: 'yes', multiplier: 7, course: 'marathon', extra: 1 }),
    DEFAULT_SETTINGS,
  );
  const storage = memory();
  storage.setItem(SETTINGS_KEY, '{broken');
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(undefined), DEFAULT_SETTINGS);
});

test('settings has its own tab and screen', () => {
  assert.ok(TABS.some((t) => t.id === 'settings'));
  const html = settingsMarkup({ settings: { ...DEFAULT_SETTINGS, course: '5k' }, runCount: 1, version: '0.1.0' });
  assert.match(html, /id="voice-toggle" checked/);
  assert.match(html, /class="chip active" data-default-course="5k"/);
  assert.match(html, /1 run saved on this device/);
  assert.match(html, /CogniRun 0\.1\.0/);
  assert.match(settingsMarkup({ settings: DEFAULT_SETTINGS }), /id="clear-runs" disabled/);
});
