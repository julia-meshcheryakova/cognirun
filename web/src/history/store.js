import { upgradeRunRecord } from './runRecord.js';

/**
 * Run store contract. Every adapter (this local one, the Supabase one) exposes
 * the same async API so screens never care where runs live:
 *
 *   list({ includeDemo = true, course, challengeId }) -> RunRecord[] (newest first)
 *   get(id)                                           -> RunRecord | null
 *   save(record)                                      -> RunRecord (insert or replace by id)
 *   remove(id)                                        -> void
 *   subscribe(listener)                               -> unsubscribe(); listener() after every change
 *
 * @typedef {object} RunStore
 */

/**
 * @typedef {object} RunFilter
 * @property {boolean} [includeDemo]
 * @property {string} [course]
 * @property {string|null} [challengeId]  null: solo runs only
 */

export const LOCAL_RUNS_KEY = 'cognirun.runs.v1';
export const LOCAL_RUNS_LIMIT = 500;

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

/**
 * @param {import('./runRecord.js').RunRecord[]} runs
 * @param {RunFilter} [filter]
 */
export function filterRuns(runs, { includeDemo = true, course, challengeId } = {}) {
  return runs.filter(
    (r) =>
      (includeDemo || !r.demo) &&
      (course === undefined || r.course === course) &&
      (challengeId === undefined || r.challengeId === challengeId),
  );
}

/**
 * Runs kept on this device (localStorage), newest first, capped at `limit`.
 * Falls back to memory where there is no localStorage (Node tests).
 *
 * @returns {RunStore}
 */
export function createLocalRunStore({
  storage = globalThis.localStorage ?? memoryStorage(),
  key = LOCAL_RUNS_KEY,
  limit = LOCAL_RUNS_LIMIT,
} = {}) {
  const listeners = new Set();

  function read() {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(upgradeRunRecord).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function write(runs) {
    const sorted = runs
      .slice()
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
      .slice(0, limit);
    storage.setItem(key, JSON.stringify(sorted));
    listeners.forEach((listener) => listener());
  }

  return {
    async list(filter) {
      return filterRuns(read(), filter);
    },
    async get(id) {
      return read().find((r) => r.id === id) ?? null;
    },
    async save(record) {
      write([record, ...read().filter((r) => r.id !== record.id)]);
      return record;
    },
    async remove(id) {
      write(read().filter((r) => r.id !== id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
