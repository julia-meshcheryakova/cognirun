import assert from 'node:assert/strict';
import test from 'node:test';

import { accountMarkup } from '../src/ui/account.js';
import { TABS, navMarkup, parseRoute } from '../src/ui/nav.js';

const sync = (patch = {}) => ({ state: 'idle', unsynced: 0, lastSyncedAt: null, error: null, ...patch });
const auth = (patch = {}) => ({ status: 'signed-out', user: null, profile: null, error: null, notice: null, ...patch });

test('the account tab is routed at #/account', () => {
  assert.deepEqual(
    TABS.find((t) => t.id === 'account'),
    { id: 'account', label: 'You', icon: '👤' },
  );
  assert.equal(parseRoute('#/account').tab, 'account');
  assert.match(navMarkup('account'), /href="#\/account"[^>]*aria-current="page"/);
});

test('unconfigured: a note and the local run count, no sign-in UI', () => {
  const html = accountMarkup({ auth: auth({ status: 'unconfigured' }), sync: sync({ state: 'local-only', unsynced: 3 }) });
  assert.match(html, /data-screen="account"/);
  assert.match(html, /Sign-in is not configured/);
  assert.match(html, /3 runs on this device/);
  assert.doesNotMatch(html, /google-signin|email-form|sign-out/);
});

test('signed out: Google and email sign-in, with the runs waiting to join', () => {
  const html = accountMarkup({
    auth: auth({ notice: 'Check a@b.co for a sign-in link.' }),
    sync: sync({ state: 'signed-out', unsynced: 1 }),
    draft: { email: 'a@b.co' },
  });
  assert.match(html, /id="google-signin"/);
  assert.match(html, /id="email-form"/);
  assert.match(html, /value="a@b.co"/);
  assert.match(html, /role="status">Check a@b.co/);
  assert.match(html, /1 run on this device will be added/);
  assert.doesNotMatch(html, /sign-out/);
  assert.doesNotMatch(html, /account-offline/);
});

test('signed out because offline: a reconnect note above the sign-in options', () => {
  const html = accountMarkup({ auth: auth({ offline: true }), sync: sync({ state: 'signed-out' }) });
  assert.match(html, /id="account-offline"[^>]*>You seem to be offline/);
  assert.match(html, /id="google-signin"/);
});

test('signed in: name, sync status, unsynced count and sign-out', () => {
  const html = accountMarkup({
    auth: auth({ status: 'signed-in', user: { id: 'u', email: 'ada@example.com' }, profile: { display_name: 'Ada' } }),
    sync: sync({ unsynced: 2 }),
  });
  assert.match(html, /Signed in as <strong>ada@example.com<\/strong>/);
  assert.match(html, /id="display-name"[^>]*value="Ada"/);
  assert.match(html, /2 runs waiting to upload/);
  assert.match(html, /2 unsynced runs/);
  assert.match(html, /id="sync-now"/);
  assert.match(html, /id="sign-out"/);
  assert.doesNotMatch(html, /google-signin/);
});

test('signed in: syncing, error and all-synced states', () => {
  const signedIn = auth({ status: 'signed-in', user: { id: 'u', email: 'a@b.co' }, profile: { display_name: 'A' } });
  assert.match(accountMarkup({ auth: signedIn, sync: sync({ state: 'syncing' }) }), /Syncing…[\s\S]*id="sync-now" disabled/);
  assert.match(
    accountMarkup({ auth: signedIn, sync: sync({ state: 'error', error: 'offline', unsynced: 1 }) }),
    /data-sync-state="error"[\s\S]*Sync failed: offline/,
  );
  assert.match(accountMarkup({ auth: signedIn, sync: sync() }), /All runs are saved to your account/);
});

test('account markup escapes user content', () => {
  const html = accountMarkup({
    auth: auth({
      status: 'signed-in',
      user: { id: 'u', email: '<b>x</b>@y.z' },
      profile: { display_name: '"><script>alert(1)</script>' },
      error: '<img src=x>',
    }),
    sync: sync(),
  });
  assert.doesNotMatch(html, /<script>|<img|<b>x/);
  assert.match(html, /&lt;script&gt;/);
});

test('loading shows a placeholder', () => {
  assert.match(accountMarkup({ auth: auth({ status: 'loading' }), sync: sync({ state: 'loading' }) }), /Checking your account/);
});
