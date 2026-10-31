import assert from 'node:assert/strict';
import test from 'node:test';

import { toRunRecord } from '../src/history/runRecord.js';
import { createLocalRunStore } from '../src/history/store.js';
import { createRemoteRunStore, fromRunRow, toAnswerRows, toRunRow } from '../src/history/remoteStore.js';
import { createSyncedRunStore } from '../src/history/syncedStore.js';
import { createFakeSupabase, memoryStorage, settle } from './fakeSupabase.mjs';

const answers = [
  { questionId: 't1', category: 'trivia', kilometer: 1, elapsedSeconds: 4.2, points: 90, text: 'Paris', correctAnswer: 'Paris', correct: true, verdict: { method: 'exact' } },
  { questionId: 'l1', category: 'logic', kilometer: 2, elapsedSeconds: 9, points: 0, text: '', correctAnswer: '7', correct: false, verdict: { method: 'empty' } },
];

function record(id, finishedAt = '2026-01-05T10:00:00.000Z', overrides = {}) {
  return {
    ...toRunRecord({
      snapshot: {
        distance: 3000,
        elapsedSeconds: 900,
        samples: Array.from({ length: 5 }, (_, i) => ({ lat: 52 + i / 1e4, lng: 4, t: i, distance: i * 3, speed: 3, heartRate: 150, accuracy: 5 })),
      },
      answers,
      settings: { course: '3k', demo: false },
      finishedAt: new Date(finishedAt),
    }),
    id,
    ...overrides,
  };
}

/** A minimal auth double with the surface syncedStore uses. */
function fakeAuth(client, initial = { status: 'loading', user: null }) {
  const listeners = new Set();
  let state = initial;
  return {
    state: () => state,
    client: () => client,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next) {
      state = next;
      listeners.forEach((fn) => fn(state));
    },
  };
}

const signedIn = (id) => ({ status: 'signed-in', user: { id, email: `${id}@example.com` } });

test('RunRecord <-> rows round-trips', () => {
  const r = record('run-1', '2026-01-05T10:00:00.000Z', { challengeId: '2026-W02-3k', mode: 'challenge', hrAvg: 151.6 });
  const row = toRunRow(r, 'u1');
  assert.equal(row.id, 'run-1');
  assert.equal(row.user_id, 'u1');
  assert.equal(row.challenge_id, '2026-W02-3k');
  assert.equal(row.mode, 'challenge');
  assert.equal(row.hr_avg, 152);
  assert.ok(Array.isArray(row.route) && row.route.length > 0);

  const answerRows = toAnswerRows(r, 'u1');
  assert.deepEqual(
    answerRows.map((a) => [a.run_id, a.idx, a.question_id, a.category, a.km, a.user_id]),
    [
      ['run-1', 0, 't1', 'trivia', 1, 'u1'],
      ['run-1', 1, 'l1', 'logic', 2, 'u1'],
    ],
  );

  // timestamptz comes back in Postgres format and answers in any order
  const back = fromRunRow({
    ...row,
    started_at: row.started_at.replace('.000Z', '+00:00'),
    finished_at: '2026-01-05 10:00:00+00',
    run_answers: answerRows.slice().reverse(),
  });
  assert.equal(back.finishedAt, '2026-01-05T10:00:00.000Z');
  assert.equal(back.startedAt, r.startedAt);
  assert.equal(back.synced, true);
  const strip = ({ synced: _, ...rest }) => rest;
  assert.deepEqual(strip(back), strip({ ...r, hrAvg: 152 }));
});

test('remote store saves, lists, gets and removes runs', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const remote = createRemoteRunStore({ client: fake, userId: 'u1' });

  await remote.save(record('a', '2026-01-01T10:00:00.000Z'));
  await remote.save(record('b', '2026-01-03T10:00:00.000Z', { course: '5k', demo: true }));
  await remote.save(record('c', '2026-01-02T10:00:00.000Z', { challengeId: 'w2', mode: 'challenge' }));
  await remote.save(record('a', '2026-01-01T10:00:00.000Z', { points: 999 })); // upsert, idempotent
  assert.equal(fake.tables.runs.length, 3);
  assert.equal(fake.tables.run_answers.length, 6);

  assert.deepEqual((await remote.list()).map((r) => r.id), ['b', 'c', 'a']);

  const a = await remote.get('a');
  assert.equal(a.points, 999);
  assert.equal(a.answers.length, 2);
  assert.equal(await remote.get('missing'), null);

  await remote.remove('a');
  assert.equal(await remote.get('a'), null);
  assert.equal(fake.tables.run_answers.length, 4, 'answers cascade');
});

test('remote store surfaces errors', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const remote = createRemoteRunStore({ client: fake, userId: 'u1' });
  fake.fail('runs', 'upsert', 'offline');
  await assert.rejects(remote.save(record('a')), /offline/);
  fake.fail('runs', 'select', 'JWT expired');
  await assert.rejects(remote.list(), /JWT expired/);
});

test('remote store cannot write another user\'s runs (RLS)', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  await createRemoteRunStore({ client: fake, userId: 'u1' }).save(record('a'));
  fake.emit('SIGNED_IN', { user: { id: 'u2' } });
  const mallory = createRemoteRunStore({ client: fake, userId: 'u2' });
  assert.deepEqual(await mallory.list(), []);
  await assert.rejects(mallory.save(record('a')), /row-level security/);
});

test('synced store without auth is the local store', async () => {
  const local = createLocalRunStore({ storage: memoryStorage() });
  const store = createSyncedRunStore({ local });
  await store.save(record('a'));
  assert.deepEqual((await store.list()).map((r) => r.id), ['a']);
  assert.equal((await store.get('a')).synced, false);
  assert.equal(store.syncStatus().state, 'local-only');
  assert.equal((await store.sync()).state, 'local-only');
  await store.remove('a');
  assert.deepEqual(await store.list(), []);
});

test('synced store is local-only when sign-in is not configured', async () => {
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(null);
  const store = createSyncedRunStore({ local, auth });
  assert.equal(store.syncStatus().state, 'loading');
  await local.save(record('a'));
  auth.set({ status: 'unconfigured', user: null });
  await settle();
  assert.equal(store.syncStatus().state, 'local-only');
  assert.equal(store.syncStatus().unsynced, 1);
  assert.deepEqual((await store.list()).map((r) => r.id), ['a']);
});

test('signing in uploads runs made before, and new runs sync after saving', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake);
  const store = createSyncedRunStore({ local, auth });
  auth.set({ status: 'signed-out', user: null });
  await store.save(record('before', '2026-01-01T10:00:00.000Z'));
  await settle();
  assert.equal(store.syncStatus().state, 'signed-out');
  assert.equal(store.syncStatus().unsynced, 1);
  assert.equal(fake.tables.runs.length, 0);

  auth.set(signedIn('u1'));
  await settle();
  assert.deepEqual(fake.tables.runs.map((r) => [r.id, r.user_id]), [['before', 'u1']]);
  assert.equal((await local.get('before')).synced, true);
  assert.equal(store.syncStatus().state, 'idle');
  assert.equal(store.syncStatus().unsynced, 0);
  assert.ok(store.syncStatus().lastSyncedAt);

  let notified = 0;
  store.subscribe(() => notified++);
  const saved = await store.save(record('after', '2026-01-02T10:00:00.000Z', { synced: true }));
  assert.equal(saved.synced, false, 'saving always starts unsynced');
  await settle();
  assert.equal((await local.get('after')).synced, true);
  assert.equal(fake.tables.runs.length, 2);
  assert.ok(notified > 0);
});

test('list merges device and account runs, deduped by id, newest first', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const remote = createRemoteRunStore({ client: fake, userId: 'u1' });
  await remote.save(record('phone', '2026-01-03T10:00:00.000Z'));
  await remote.save(record('both', '2026-01-02T10:00:00.000Z', { points: 1 }));
  await remote.save(record('demo', '2026-01-04T10:00:00.000Z', { demo: true }));

  const local = createLocalRunStore({ storage: memoryStorage() });
  await local.save(record('both', '2026-01-02T10:00:00.000Z', { points: 2, synced: true }));
  await local.save(record('here', '2026-01-01T10:00:00.000Z', { synced: true }));
  const store = createSyncedRunStore({ local, auth: fakeAuth(fake, signedIn('u1')) });

  const runs = await store.list();
  assert.deepEqual(runs.map((r) => r.id), ['demo', 'phone', 'both', 'here']);
  assert.equal(runs.find((r) => r.id === 'both').points, 2, 'the device copy wins');
  assert.deepEqual((await store.list({ includeDemo: false })).map((r) => r.id), ['phone', 'both', 'here']);
  assert.equal((await store.get('phone')).id, 'phone', 'get falls back to the account');
});

test('list falls back to the device when the account is unreachable', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  await local.save(record('here', '2026-01-01T10:00:00.000Z', { synced: true }));
  const store = createSyncedRunStore({ local, auth: fakeAuth(fake, signedIn('u1')) });
  await settle();
  fake.fail('runs', 'select', 'Failed to fetch');
  assert.deepEqual((await store.list()).map((r) => r.id), ['here']);
  assert.equal(store.syncStatus().error, 'Failed to fetch');
});

test('a failed upload stays unsynced and retries on the next sync', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, { status: 'signed-out', user: null });
  const store = createSyncedRunStore({ local, auth });
  await store.save(record('a'));
  fake.fail('runs', 'upsert', 'offline');
  auth.set(signedIn('u1'));
  await settle();
  assert.equal(store.syncStatus().state, 'error');
  assert.equal(store.syncStatus().error, 'offline');
  assert.equal(store.syncStatus().unsynced, 1);
  assert.equal((await local.get('a')).synced, false);

  const status = await store.sync();
  assert.equal(status.state, 'idle');
  assert.equal(status.unsynced, 0);
  assert.equal(fake.tables.runs.length, 1);
});

test('concurrent syncs upload each run once', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  await local.save(record('a'));
  const auth = fakeAuth(fake);
  const store = createSyncedRunStore({ local, auth });
  auth.set(signedIn('u1')); // starts a sync
  await Promise.all([store.sync(), store.sync(), store.sync()]);
  await settle();
  assert.equal(fake.calls.filter((c) => c.table === 'runs' && c.op === 'upsert').length, 1);
});

test('signing out removes synced runs from the device and keeps unsynced ones', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, signedIn('u1'));
  const store = createSyncedRunStore({ local, auth });
  await store.save(record('synced', '2026-01-01T10:00:00.000Z'));
  await settle();
  assert.equal((await local.get('synced')).synced, true);

  fake.fail('runs', 'upsert', 'offline');
  await store.save(record('pending', '2026-01-02T10:00:00.000Z'));
  await settle();

  fake.emit('SIGNED_OUT', null);
  auth.set({ status: 'signed-out', user: null });
  await settle();
  assert.deepEqual((await local.list()).map((r) => r.id), ['pending']);
  assert.deepEqual((await store.list()).map((r) => r.id), ['pending']);
  assert.equal(store.syncStatus().state, 'signed-out');
  assert.equal(store.syncStatus().unsynced, 1);
  assert.equal(fake.tables.runs.length, 1, 'the account keeps its runs');
});

test('one run that fails to upload does not hold back the others', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, { status: 'signed-out', user: null });
  const store = createSyncedRunStore({ local, auth });
  await store.save(record('newer', '2026-01-02T10:00:00.000Z'));
  await store.save(record('older', '2026-01-01T10:00:00.000Z'));
  fake.fail('runs', 'upsert', 'value too long'); // the first (newest) one
  auth.set(signedIn('u1'));
  await settle();
  assert.equal((await local.get('newer')).synced, false);
  assert.equal((await local.get('older')).synced, true);
  assert.deepEqual(fake.tables.runs.map((r) => r.id), ['older']);
  assert.equal(store.syncStatus().state, 'error');
  assert.equal(store.syncStatus().error, 'value too long');
  assert.equal(store.syncStatus().unsynced, 1);
});

test('losing the session while offline keeps synced runs on the device', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, signedIn('u1'));
  const store = createSyncedRunStore({ local, auth });
  await store.save(record('synced'));
  await settle();
  assert.equal((await local.get('synced')).synced, true);
  auth.set({ status: 'signed-out', user: null, offline: true });
  await settle();
  assert.deepEqual((await local.list()).map((r) => r.id), ['synced']);
  assert.equal(store.syncStatus().state, 'signed-out');
});

test('signing out during an upload leaves that run unsynced on the device', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, signedIn('u1'));
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const createRemote = (options) => {
    const remote = createRemoteRunStore(options);
    return { ...remote, save: async (r) => (await gate, remote.save(r)) };
  };
  const store = createSyncedRunStore({ local, auth, createRemote });
  await store.save(record('in-flight'));
  await settle();
  assert.equal(store.syncStatus().state, 'syncing');
  auth.set({ status: 'signed-out', user: null });
  await settle();
  release();
  await settle();
  const kept = await local.get('in-flight');
  assert.ok(kept, 'the run is still on the device');
  assert.equal(kept.synced, false, 'and will be uploaded by whoever signs in next');
  assert.equal(store.syncStatus().state, 'signed-out');
  assert.equal(store.syncStatus().unsynced, 1);
});

test('switching accounts never uploads into the wrong account', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake, signedIn('u1'));
  const store = createSyncedRunStore({ local, auth });
  await store.save(record('mine'));
  await settle();
  fake.emit('SIGNED_OUT', null);
  auth.set({ status: 'signed-out', user: null });
  await settle();
  fake.emit('SIGNED_IN', { user: { id: 'u2' } });
  auth.set(signedIn('u2'));
  await settle();
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(fake.tables.runs.map((r) => r.user_id), ['u1']);
});

test('remove deletes on the device and in the account', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const store = createSyncedRunStore({ local, auth: fakeAuth(fake, signedIn('u1')) });
  await store.save(record('a'));
  await settle();
  assert.equal(fake.tables.runs.length, 1);
  await store.remove('a');
  assert.equal(fake.tables.runs.length, 0);
  assert.deepEqual(await store.list(), []);
});

test('nothing uploads until the account accepted the terms', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1' } } });
  const local = createLocalRunStore({ storage: memoryStorage() });
  const auth = fakeAuth(fake);
  let accepted = false;
  auth.termsAccepted = async () => accepted;
  const store = createSyncedRunStore({ local, auth });
  auth.set({ status: 'signed-out', user: null });
  await store.save(record('r1'));
  auth.set(signedIn('u1'));
  await settle();
  assert.equal(fake.tables.runs.length, 0);
  assert.equal(store.syncStatus().state, 'needs-consent');
  assert.equal(store.syncStatus().unsynced, 1);
  await store.save(record('r2', '2026-01-06T10:00:00.000Z'));
  await settle();
  assert.equal(fake.tables.runs.length, 0, 'saving while waiting for consent uploads nothing');

  accepted = true;
  auth.set({ ...signedIn('u1'), profile: { terms_version: 'now' } }); // the profile changed
  await settle();
  assert.deepEqual(fake.tables.runs.map((r) => r.id).sort(), ['r1', 'r2']);
  assert.equal(store.syncStatus().state, 'idle');
  assert.equal(store.syncStatus().unsynced, 0);
});
