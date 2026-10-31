import assert from 'node:assert/strict';
import test from 'node:test';

import { createErrorReporter, safeUrl } from '../src/logger.js';
import { buildDataExport, exportFileName } from '../src/dataExport.js';
import { aboutMarkup } from '../src/ui/about.js';
import { parseRoute } from '../src/ui/nav.js';
import { settingsMarkup } from '../src/ui/settings.js';
import { DEFAULT_SETTINGS } from '../src/settings.js';

function fakeClient({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return { error: fail ? { message: 'nope' } : null };
    },
  };
}

function fakeWindow(location = { protocol: 'https:', hostname: 'cognirun.vercel.app', pathname: '/', hash: '#/history?code=secret' }) {
  const handlers = {};
  return {
    handlers,
    location,
    navigator: { userAgent: 'TestUA' },
    addEventListener: (type, fn) => (handlers[type] = fn),
  };
}

test('error reports go to the log_client_error RPC without query strings', async () => {
  const client = fakeClient();
  const win = fakeWindow();
  const reporter = createErrorReporter({ getClient: async () => client, version: '0.2.0', win });
  assert.equal(await reporter.report(new TypeError('x is undefined')), true);
  assert.equal(client.calls.length, 1);
  const { name, args } = client.calls[0];
  assert.equal(name, 'log_client_error');
  assert.equal(args.p_level, 'error');
  assert.equal(args.p_message, 'x is undefined');
  assert.match(args.p_stack, /TypeError/);
  assert.equal(args.p_url, '/#/history');
  assert.equal(args.p_app_version, '0.2.0');
  assert.equal(args.p_user_agent, 'TestUA');
});

test('reports are deduplicated, capped, filtered and never throw', async () => {
  const client = fakeClient();
  const reporter = createErrorReporter({ getClient: async () => client, win: fakeWindow(), maxReports: 2 });
  assert.equal(await reporter.report('same'), true);
  assert.equal(await reporter.report('same'), false);
  assert.equal(await reporter.report('Script error.'), false);
  assert.equal(await reporter.report(''), false);
  assert.equal(await reporter.report({ message: 'second' }), true);
  assert.equal(await reporter.report('third'), false);
  assert.equal(client.calls.length, 2);

  const broken = createErrorReporter({ getClient: async () => { throw new Error('offline'); }, win: fakeWindow() });
  assert.equal(await broken.report('boom'), false);
  const failing = createErrorReporter({ getClient: async () => fakeClient({ fail: true }), win: fakeWindow() });
  assert.equal(await failing.report('boom'), false);
  const unconfigured = createErrorReporter({ getClient: async () => null, win: fakeWindow() });
  assert.equal(await unconfigured.report('boom'), false);
});

test('the reporter listens for uncaught errors, except on http://localhost', async () => {
  const client = fakeClient();
  const win = fakeWindow();
  assert.equal(createErrorReporter({ getClient: async () => client, win }).install(), true);
  win.handlers.error({ error: new Error('uncaught') });
  win.handlers.unhandledrejection({ reason: new Error('rejected') });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(client.calls.map((c) => c.args.p_message), ['uncaught', 'rejected']);

  const dev = fakeWindow({ protocol: 'http:', hostname: 'localhost', pathname: '/', hash: '' });
  assert.equal(createErrorReporter({ getClient: async () => client, win: dev }).install(), false);
  // The Android app is served from https://localhost and does report.
  const android = fakeWindow({ protocol: 'https:', hostname: 'localhost', pathname: '/', hash: '' });
  assert.equal(createErrorReporter({ getClient: async () => client, win: android }).install(), true);
  assert.equal(safeUrl(undefined), null);
});

test('the data export holds the account and every run', () => {
  const now = new Date('2026-11-01T10:00:00Z');
  const runs = [{ id: 'r1', points: 200 }];
  const signedIn = buildDataExport({
    runs,
    version: '0.2.0',
    now,
    authState: {
      status: 'signed-in',
      user: { id: 'u1', email: 'a@example.com' },
      profile: { display_name: 'Alice', created_at: '2026-10-01T00:00:00Z', terms_version: '2026-10-31', terms_accepted_at: '2026-10-31T00:00:00Z' },
    },
  });
  assert.deepEqual(signedIn, {
    app: 'CogniRun',
    version: '0.2.0',
    exportedAt: '2026-11-01T10:00:00.000Z',
    account: {
      id: 'u1',
      email: 'a@example.com',
      displayName: 'Alice',
      createdAt: '2026-10-01T00:00:00Z',
      termsVersion: '2026-10-31',
      termsAcceptedAt: '2026-10-31T00:00:00Z',
    },
    runs,
  });
  assert.equal(buildDataExport({ runs, authState: { status: 'signed-out', user: null } }).account, null);
  assert.equal(exportFileName(now), 'cognirun-data-2026-11-01.json');
});

test('export is offered with runs or an account; the About page is routable', () => {
  assert.match(settingsMarkup({ settings: DEFAULT_SETTINGS }), /id="export-runs" disabled>Export my data/);
  assert.doesNotMatch(settingsMarkup({ settings: DEFAULT_SETTINGS, signedIn: true }), /id="export-runs" disabled/);
  assert.match(settingsMarkup({ settings: DEFAULT_SETTINGS }), /href="#\/about"/);
  assert.deepEqual(parseRoute('#/about'), { tab: 'about', params: [] });
  const html = aboutMarkup({ version: '0.2.0' });
  assert.match(html, /About CogniRun/);
  assert.match(html, /Version 0\.2\.0/);
  assert.match(html, /mailto:/);
});
