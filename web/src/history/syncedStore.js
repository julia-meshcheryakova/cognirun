import { filterRuns } from './store.js';
import { createRemoteRunStore } from './remoteStore.js';

/**
 * The app's RunStore: the device first, the account when signed in.
 *
 * - save():  writes locally (synced: false), then uploads in the background and
 *            marks the local copy synced: true.
 * - sign-in: every unsynced local run is uploaded (runs made before signing up
 *            join the new account).
 * - list():  local and account runs merged and deduped by id (the local copy
 *            wins), newest first; falls back to local when offline.
 * - sign-out: synced runs are removed from the device (they are safe in the
 *            account), so the next person to sign in on it never sees them.
 *            Unsynced runs stay. A session lost only because the device is
 *            offline (auth state `offline`) keeps everything.
 * - consent: nothing is uploaded until the account accepted the current terms
 *            (auth.termsAccepted()); the state is 'needs-consent' meanwhile.
 *
 * Without an `auth` (or with Supabase unconfigured) it is the local store.
 *
 * @typedef {object} SyncStatus
 * @property {'loading'|'local-only'|'signed-out'|'idle'|'syncing'|'needs-consent'|'error'} state
 * @property {number} unsynced     local runs not uploaded yet
 * @property {string|null} lastSyncedAt
 * @property {string|null} error
 */

const AUTH_WAIT_MS = 3000;
const MAX_SYNC_PASSES = 3;

const errorText = (err) => err?.message || String(err);

/**
 * @param {object} options
 * @param {import('./store.js').RunStore} options.local
 * @param {ReturnType<import('../auth/session.js').createAuth>} [options.auth]
 * @param {typeof createRemoteRunStore} [options.createRemote]
 * @returns {import('./store.js').RunStore & { sync(): Promise<SyncStatus>, syncStatus(): SyncStatus }}
 */
export function createSyncedRunStore({ local, auth = null, createRemote = createRemoteRunStore }) {
  const listeners = new Set();
  let remote = null;
  let userId = null;
  let remoteRuns = null; // cached account runs for the attached user
  let syncing = null;
  let rerun = false;
  /** @type {SyncStatus} */
  let status = { state: auth ? 'loading' : 'local-only', unsynced: 0, lastSyncedAt: null, error: null };
  let settled = false;
  let settle;
  const authSettled = new Promise((resolve) => {
    settle = () => {
      settled = true;
      resolve();
    };
  });

  async function waitForAuth() {
    if (settled) return;
    let timer;
    await Promise.race([authSettled, new Promise((resolve) => (timer = setTimeout(resolve, AUTH_WAIT_MS)))]);
    clearTimeout(timer);
  }

  const notify = () => listeners.forEach((listener) => listener());
  function setStatus(patch) {
    status = { ...status, ...patch };
    notify();
  }
  const countUnsynced = async () => (await local.list()).filter((r) => !r.synced).length;

  local.subscribe(async () => {
    status = { ...status, unsynced: await countUnsynced() };
    notify();
  });

  function attach(client, id) {
    userId = id;
    remote = createRemote({ client, userId: id });
    remoteRuns = null;
    setStatus({ state: 'idle', error: null });
    void sync();
  }

  function detach() {
    remote = null;
    userId = null;
    remoteRuns = null;
  }

  async function forgetSyncedRuns() {
    for (const run of await local.list()) {
      if (run.synced) await local.remove(run.id);
    }
  }

  async function onAuth(state) {
    if (state.status !== 'loading') settle();
    if (state.status === 'signed-in' && state.user && auth.client()) {
      if (userId !== state.user.id) attach(auth.client(), state.user.id);
      // Terms just accepted (the profile changed): uploads can start.
      else if (status.state === 'needs-consent' && !syncing) void sync();
    } else if (state.status === 'signed-out') {
      detach();
      // Let an in-flight upload notice the sign-out before anything is purged.
      await syncing?.catch(() => {});
      // Offline is not a sign-out: keep the runs until the session is back.
      if (!state.offline) await forgetSyncedRuns();
      setStatus({ state: 'signed-out', error: null, unsynced: await countUnsynced() });
    } else if (state.status === 'unconfigured') {
      detach();
      setStatus({ state: 'local-only', unsynced: await countUnsynced() });
    }
  }

  if (auth) {
    auth.subscribe((state) => void onAuth(state));
    void onAuth(auth.state());
  } else {
    settle();
  }
  void countUnsynced().then((unsynced) => {
    status = { ...status, unsynced };
  });

  function accountRuns() {
    if (!remote) return Promise.resolve([]);
    const current = remote;
    remoteRuns ??= current.list().catch((err) => {
      // No notify here: a listener that re-lists would loop while offline.
      if (remote === current) {
        remoteRuns = null;
        status = { ...status, error: errorText(err) };
      }
      return [];
    });
    return remoteRuns;
  }

  function sync() {
    if (!remote) return Promise.resolve(status);
    if (syncing) {
      rerun = true;
      return syncing;
    }
    const current = remote;
    const run = async () => {
      setStatus({ state: 'syncing', error: null });
      try {
        // Runs carry location and heart rate: upload nothing until the account agreed to the terms.
        if (auth?.termsAccepted && !(await auth.termsAccepted())) {
          if (remote === current) setStatus({ state: 'needs-consent', unsynced: await countUnsynced() });
          return;
        }
        let passes = 0;
        let failure = null;
        do {
          rerun = false;
          failure = null;
          passes++;
          for (const record of (await local.list()).filter((r) => !r.synced)) {
            if (remote !== current) return;
            try {
              await current.save(record);
            } catch (err) {
              // One bad record must not hold the others back.
              failure ??= err;
              continue;
            }
            if (remote !== current) return; // signed out mid-upload: leave it unsynced
            const latest = await local.get(record.id);
            // Only mark it synced if it was not re-saved while uploading.
            if (latest && JSON.stringify(latest) === JSON.stringify(record)) {
              await local.save({ ...record, synced: true });
            } else if (latest) {
              rerun = true;
            }
          }
        } while (rerun && passes < MAX_SYNC_PASSES && remote === current);
        rerun = false;
        if (remote !== current) return;
        remoteRuns = null;
        const unsynced = await countUnsynced();
        if (failure) {
          setStatus({ state: 'error', error: errorText(failure), unsynced });
        } else {
          setStatus({ state: 'idle', lastSyncedAt: new Date().toISOString(), unsynced });
        }
      } catch (err) {
        rerun = false; // retried by the next save or "Sync now"
        if (remote === current) {
          setStatus({ state: 'error', error: errorText(err), unsynced: await countUnsynced() });
        }
      }
    };
    syncing = run().then(() => {
      syncing = null;
      // A save that arrived after the last pass but before this point.
      if (rerun && remote) return sync();
      return status;
    });
    return syncing;
  }

  return {
    async list(filter) {
      await waitForAuth();
      const [mine, theirs] = await Promise.all([local.list(), accountRuns()]);
      const byId = new Map(theirs.map((r) => [r.id, r]));
      mine.forEach((r) => byId.set(r.id, r));
      const merged = [...byId.values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
      return filterRuns(merged, filter);
    },
    async get(id) {
      const mine = await local.get(id);
      if (mine || !remote) return mine;
      return remote.get(id).catch(() => null);
    },
    async save(record) {
      const saved = await local.save({ ...record, synced: false });
      void sync();
      return saved;
    },
    async remove(id) {
      await local.remove(id);
      if (!remote) return;
      try {
        await remote.remove(id);
      } catch (err) {
        status = { ...status, error: errorText(err) };
      }
      remoteRuns = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Upload unsynced local runs now (the account screen's "Sync now"). */
    sync,
    syncStatus: () => status,
  };
}
