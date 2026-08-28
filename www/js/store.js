const ACTIVE_KEY = 'cognirun.active.v1';
const HISTORY_KEY = 'cognirun.sessions.v1';
const SETTINGS_KEY = 'cognirun.settings.v1';

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function createSession({ participant, protocol, telemetryMode = 'simulation' }) {
  const now = new Date();
  const id = `cr_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    schemaVersion: 1,
    analysisVersion: 1,
    protocolVersion: protocol.version,
    id,
    seed: protocol.seed,
    kind: telemetryMode === 'simulation' ? 'synthetic-demo' : 'participant',
    synthetic: telemetryMode === 'simulation',
    syntheticLabel: telemetryMode === 'simulation'
      ? 'Demonstration session using simulated ROXFIT telemetry'
      : null,
    status: 'active',
    startedAt: now.toISOString(),
    completedAt: null,
    participant,
    protocol,
    telemetryMode,
    stages: [],
    trials: [],
    telemetry: [],
    events: [],
    results: null,
  };
}

export function appendEvent(session, type, payload = {}) {
  const event = {
    id: `${session.id}_${session.events.length}_${type}`,
    type,
    at: new Date().toISOString(),
    wallMs: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
    ...payload,
  };
  session.events.push(event);
  return event;
}

export function appendTelemetry(session, sample) {
  session.telemetry.push({ ...sample });
  if (session.telemetry.length % 10 === 0) persistActiveSession(session);
}

export function addTrial(session, trial) {
  const existing = session.trials.findIndex((item) => item.id === trial.id);
  if (existing >= 0) session.trials[existing] = trial;
  else session.trials.push(trial);
  persistActiveSession(session);
}

export function persistActiveSession(session) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
  } catch {
    // Storage failure must never interrupt a live protocol.
  }
}

export function loadActiveSession() {
  try {
    return safeParse(localStorage.getItem(ACTIVE_KEY), null);
  } catch {
    return null;
  }
}

export function completeSession(session) {
  if (session.status === 'active') session.status = 'complete';
  session.completedAt = new Date().toISOString();
  try {
    const history = safeParse(localStorage.getItem(HISTORY_KEY), []);
    history.unshift(session);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Keep the in-memory result available even if persistence is unavailable.
  }
  return session;
}

export function listSessions() {
  try {
    return safeParse(localStorage.getItem(HISTORY_KEY), []);
  } catch {
    return [];
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are optional.
  }
}

export function loadSettings() {
  try {
    return safeParse(localStorage.getItem(SETTINGS_KEY), {});
  } catch {
    return {};
  }
}

export function downloadSession(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${session.id}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
