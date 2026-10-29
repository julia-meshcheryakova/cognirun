import { COURSES, DEFAULT_COURSE, MULTIPLIERS } from './config.js';

export const SETTINGS_KEY = 'cognirun.settings.v1';
export const DEFAULT_SETTINGS = Object.freeze({
  demo: false,
  multiplier: 1,
  voice: true,
  course: DEFAULT_COURSE,
});

/** Drop unknown keys and invalid values so a stale or edited store can't break a run. */
export function sanitizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS };
  if (typeof raw.demo === 'boolean') s.demo = raw.demo;
  if (typeof raw.voice === 'boolean') s.voice = raw.voice;
  if (MULTIPLIERS.includes(raw.multiplier)) s.multiplier = raw.multiplier;
  if (Object.hasOwn(COURSES, raw.course ?? '')) s.course = raw.course;
  return s;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // private mode / quota: settings just won't persist
  }
}
