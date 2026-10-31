import assert from 'node:assert/strict';
import test from 'node:test';

import { getSupabase, isSupabaseConfigured, resetSupabaseForTests, supabaseConfig } from '../src/supabase.js';
import {
  NATIVE_AUTH_REDIRECT,
  authRedirectUrl,
  isNativePlatform,
  parseAuthCallback,
  stripAuthParams,
} from '../src/auth/redirect.js';
import { createAuth } from '../src/auth/session.js';
import { createFakeSupabase, settle } from './fakeSupabase.mjs';

const ENV = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' };

function fakeWindow(href = 'https://cognirun.vercel.app/#/run', capacitor) {
  const url = new URL(href);
  const win = {
    location: { href, origin: url.origin, pathname: url.pathname, hash: url.hash },
    replaced: [],
    history: { replaceState: (_s, _t, to) => win.replaced.push(to) },
    opened: [],
    open: (u) => win.opened.push(u),
  };
  if (capacitor) win.Capacitor = capacitor;
  return win;
}

function nativeCapacitor({ launchUrl = null } = {}) {
  const listeners = {};
  const browser = { opened: [], open: async ({ url }) => browser.opened.push(url), close: async () => {} };
  return {
    listeners,
    browser,
    isNativePlatform: () => true,
    Plugins: {
      App: {
        addListener: async (name, fn) => {
          listeners[name] = fn;
          return { remove() {} };
        },
        getLaunchUrl: async () => (launchUrl ? { url: launchUrl } : undefined),
      },
      Browser: browser,
    },
  };
}

const profileRow = (id, name = 'Ada') => ({ id, display_name: name, is_admin: false, created_at: '2026-01-01T00:00:00Z' });

test('supabase config needs both env vars', () => {
  assert.equal(supabaseConfig({}), null);
  assert.equal(supabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }), null);
  assert.equal(supabaseConfig({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: 'k' }), null);
  assert.deepEqual(supabaseConfig(ENV), { url: ENV.VITE_SUPABASE_URL, anonKey: 'anon-key' });
  assert.equal(isSupabaseConfigured({}), false);
  assert.equal(isSupabaseConfigured(ENV), true);
});

test('getSupabase never loads supabase-js when unconfigured', async () => {
  resetSupabaseForTests();
  let loads = 0;
  const client = await getSupabase({ env: {}, load: async () => (loads++, {}) });
  assert.equal(client, null);
  assert.equal(loads, 0);
});

test('getSupabase creates one PKCE client lazily and memoises it', async () => {
  resetSupabaseForTests();
  const created = [];
  const load = async () => ({ createClient: (...args) => (created.push(args), { id: created.length }) });
  const [a, b] = await Promise.all([getSupabase({ env: ENV, load }), getSupabase({ env: ENV, load })]);
  assert.equal(a, b);
  assert.equal(created.length, 1);
  const [url, key, options] = created[0];
  assert.equal(url, ENV.VITE_SUPABASE_URL);
  assert.equal(key, 'anon-key');
  assert.equal(options.auth.flowType, 'pkce');
  assert.equal(options.auth.persistSession, true);
  assert.equal(options.auth.detectSessionInUrl, true);
  resetSupabaseForTests();
  await getSupabase({ env: ENV, load, native: true });
  assert.equal(created[1][2].auth.detectSessionInUrl, false, 'the app exchanges the deep link itself');
  resetSupabaseForTests();
});

test('getSupabase stays local-only when supabase-js fails to load', async () => {
  resetSupabaseForTests();
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await getSupabase({ env: ENV, load: async () => Promise.reject(new Error('offline')) }), null);
  } finally {
    console.warn = warn;
    resetSupabaseForTests();
  }
});

test('auth redirect urls: the page on the web, the custom scheme in the app', () => {
  const location = { origin: 'https://cognirun.vercel.app', pathname: '/' };
  assert.equal(authRedirectUrl({ native: false, location }), 'https://cognirun.vercel.app/');
  assert.equal(authRedirectUrl({ native: true, location }), NATIVE_AUTH_REDIRECT);
  assert.equal(isNativePlatform({}), false);
  assert.equal(isNativePlatform({ Capacitor: { isNativePlatform: () => true } }), true);
});

test('parseAuthCallback reads codes and errors but ignores routes', () => {
  assert.deepEqual(parseAuthCallback('https://x.app/?code=abc#/run'), { code: 'abc', error: null });
  assert.deepEqual(parseAuthCallback(`${NATIVE_AUTH_REDIRECT}?code=xyz`), { code: 'xyz', error: null });
  assert.deepEqual(parseAuthCallback('https://x.app/#error=access_denied&error_description=Link+expired'), {
    code: null,
    error: 'Link expired',
  });
  assert.equal(parseAuthCallback('https://x.app/#/history'), null);
  assert.equal(parseAuthCallback('https://x.app/?foo=1'), null);
  assert.equal(parseAuthCallback('not a url'), null);
});

test('stripAuthParams keeps other params and the route', () => {
  assert.equal(stripAuthParams('https://x.app/?code=abc&ref=mail#/run'), '/?ref=mail#/run');
  assert.equal(stripAuthParams('https://x.app/app/?code=abc'), '/app/');
  assert.equal(stripAuthParams('https://x.app/#error=x&error_description=y'), '/');
});

test('auth is unconfigured (and offline) without a client', async () => {
  const auth = createAuth({ getClient: async () => null, win: fakeWindow() });
  assert.equal(auth.state().status, 'loading');
  await auth.init();
  assert.equal(auth.state().status, 'unconfigured');
  assert.equal(auth.client(), null);
  assert.equal(await auth.signInWithEmail('a@b.co'), false);
  assert.equal(await auth.signInWithGoogle(), false);
});

test('auth restores a saved session and loads the profile', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1', email: 'ada@example.com' } } });
  fake.tables.profiles.push(profileRow('u1'));
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow() });
  const seen = [];
  auth.subscribe((s) => seen.push(s.status));
  await Promise.all([auth.init(), auth.init()]);
  assert.equal(fake.auth.calls.filter(([c]) => c === 'getSession').length, 1, 'init is memoised');
  assert.equal(auth.state().status, 'signed-in');
  assert.equal(auth.state().user.email, 'ada@example.com');
  assert.equal(auth.state().profile.display_name, 'Ada');
  assert.ok(seen.includes('signed-in'));
});

test('a session that cannot be refreshed offline is not a sign-out', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u1', email: 'ada@example.com' } } });
  fake.tables.profiles.push(profileRow('u1'));
  fake.fail('auth', 'session', 'Failed to fetch');
  const win = fakeWindow();
  const onOnline = [];
  win.addEventListener = (type, fn) => type === 'online' && onOnline.push(fn);
  const auth = createAuth({ getClient: async () => fake, win });
  await auth.init();
  assert.equal(auth.state().status, 'signed-out');
  assert.equal(auth.state().offline, true);
  // supabase-js reports the startup state too; getSession() already covered it
  fake.emit('INITIAL_SESSION', null);
  await settle();
  assert.equal(auth.state().offline, true);

  assert.equal(onOnline.length, 1);
  onOnline[0]();
  await settle();
  assert.equal(auth.state().status, 'signed-in');
  assert.equal(auth.state().offline, false);

  await auth.signOut();
  assert.equal(auth.state().offline, false, 'a real sign-out is not offline');
});

test('auth starts signed out and follows auth events', async () => {
  const fake = createFakeSupabase();
  fake.tables.profiles.push(profileRow('u2', 'Grace'));
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow() });
  await auth.init();
  assert.equal(auth.state().status, 'signed-out');
  fake.emit('SIGNED_IN', { user: { id: 'u2', email: 'g@example.com' } });
  await settle();
  assert.equal(auth.state().status, 'signed-in');
  assert.equal(auth.state().profile.display_name, 'Grace');
  await auth.signOut();
  assert.equal(auth.state().status, 'signed-out');
  assert.equal(auth.state().profile, null);
});

test('email magic link redirects back to this page', async () => {
  const fake = createFakeSupabase();
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow('https://cognirun.vercel.app/#/account') });
  await auth.init();
  assert.equal(await auth.signInWithEmail('nope'), false);
  assert.match(auth.state().error, /valid email/);
  assert.equal(await auth.signInWithEmail('  ada@example.com '), true);
  const [, args] = fake.auth.calls.find(([c]) => c === 'signInWithOtp');
  assert.equal(args.email, 'ada@example.com');
  assert.equal(args.options.emailRedirectTo, 'https://cognirun.vercel.app/');
  assert.match(auth.state().notice, /ada@example.com/);
  assert.equal(auth.state().error, null);

  fake.fail('auth', 'otp', 'Email rate limit exceeded');
  assert.equal(await auth.signInWithEmail('ada@example.com'), false);
  assert.equal(auth.state().error, 'Email rate limit exceeded');
});

test('web sign-in callback: strips ?code and opens the account tab', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u3', email: 'c@example.com' } } });
  const win = fakeWindow('https://cognirun.vercel.app/?code=abc#/run');
  const auth = createAuth({ getClient: async () => fake, win });
  await auth.init();
  assert.deepEqual(win.replaced, ['/#/run']);
  assert.equal(win.location.hash, '#/account');
  assert.equal(auth.state().status, 'signed-in');
});

test('web sign-in callback with an expired link explains the problem', async () => {
  const fake = createFakeSupabase();
  const win = fakeWindow('https://cognirun.vercel.app/#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
  const auth = createAuth({ getClient: async () => fake, win });
  await auth.init();
  assert.equal(auth.state().status, 'signed-out');
  assert.equal(auth.state().error, 'Email link is invalid or has expired');
  assert.equal(win.location.hash, '#/account');
});

test('Google on the web lets supabase-js navigate', async () => {
  const fake = createFakeSupabase();
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow() });
  await auth.init();
  assert.equal(await auth.signInWithGoogle(), true);
  const [, args] = fake.auth.calls.find(([c]) => c === 'signInWithOAuth');
  assert.equal(args.provider, 'google');
  assert.equal(args.options.skipBrowserRedirect, false);
  assert.equal(args.options.redirectTo, 'https://cognirun.vercel.app/');
});

test('Android: Google opens in a Custom Tab and the deep link signs in', async () => {
  const capacitor = nativeCapacitor();
  const win = fakeWindow('https://localhost/#/account', capacitor);
  const fake = createFakeSupabase();
  const auth = createAuth({ getClient: async () => fake, win });
  await auth.init();
  assert.equal(typeof capacitor.listeners.appUrlOpen, 'function');

  await auth.signInWithGoogle();
  const [, args] = fake.auth.calls.find(([c]) => c === 'signInWithOAuth');
  assert.equal(args.options.redirectTo, NATIVE_AUTH_REDIRECT);
  assert.equal(args.options.skipBrowserRedirect, true);
  assert.deepEqual(capacitor.browser.opened, ['https://accounts.example/oauth?x=1']);

  capacitor.listeners.appUrlOpen({ url: 'https://example.com/unrelated' });
  capacitor.listeners.appUrlOpen({ url: `${NATIVE_AUTH_REDIRECT}?code=k1` });
  await settle();
  assert.deepEqual(
    fake.auth.calls.filter(([c]) => c === 'exchangeCodeForSession'),
    [['exchangeCodeForSession', 'k1']],
  );
  assert.equal(auth.state().status, 'signed-in');
  assert.equal(auth.state().user.id, 'user-k1');
});

test('Android: a cold start from the sign-in link is handled', async () => {
  const capacitor = nativeCapacitor({ launchUrl: `${NATIVE_AUTH_REDIRECT}?code=cold` });
  const fake = createFakeSupabase();
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow('https://localhost/', capacitor) });
  await auth.init();
  await settle();
  assert.equal(auth.state().user?.id, 'user-cold');
});

test('Android: a failed code exchange is shown', async () => {
  const capacitor = nativeCapacitor();
  const fake = createFakeSupabase();
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow('https://localhost/', capacitor) });
  await auth.init();
  fake.fail('auth', 'exchange', 'invalid flow state');
  assert.equal(await auth.handleNativeUrl(`${NATIVE_AUTH_REDIRECT}?code=bad`), true);
  assert.equal(auth.state().error, 'invalid flow state');
  assert.equal(await auth.handleNativeUrl(`${NATIVE_AUTH_REDIRECT}?error_description=Denied`), true);
  assert.equal(auth.state().error, 'Denied');
});

test('display name updates validate and save', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u4', email: 'd@example.com' } } });
  fake.tables.profiles.push(profileRow('u4', 'd'));
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow() });
  await auth.init();
  assert.equal(await auth.updateDisplayName('   '), false);
  assert.match(auth.state().error, /1–40/);
  assert.equal(await auth.updateDisplayName('x'.repeat(41)), false);
  assert.equal(await auth.updateDisplayName('  Dora  '), true);
  assert.equal(auth.state().profile.display_name, 'Dora');
  assert.equal(fake.tables.profiles[0].display_name, 'Dora');
  assert.equal(auth.state().notice, 'Display name saved.');
});

test('terms ticked before sign-in are recorded on the profile once signed in', async () => {
  const { memoryStorage } = await import('./fakeSupabase.mjs');
  const { TERMS_VERSION, PENDING_TERMS_KEY } = await import('../src/legal.js');
  const fake = createFakeSupabase();
  fake.tables.profiles.push(profileRow('u5', 'Eve'));
  const storage = memoryStorage();
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow(), storage });
  await auth.init();
  assert.equal(auth.hasPendingTerms(), false);
  auth.setPendingTerms(true);
  assert.equal(auth.hasPendingTerms(), true);
  assert.equal(await auth.termsAccepted(), false, 'signed out: nothing accepted yet');

  fake.emit('SIGNED_IN', { user: { id: 'u5', email: 'e@example.com' } });
  assert.equal(await auth.termsAccepted(), true, 'waits for the profile and the pending acceptance');
  assert.deepEqual(fake.calls.find((c) => c.rpc), { rpc: 'accept_terms', args: { p_version: TERMS_VERSION } });
  assert.equal(fake.tables.profiles[0].terms_version, TERMS_VERSION);
  assert.equal(auth.state().profile.terms_version, TERMS_VERSION);
  assert.equal(storage.getItem(PENDING_TERMS_KEY), null, 'the pending flag is cleared');
});

test('an account on older terms accepts the new version from the You tab', async () => {
  const { TERMS_VERSION } = await import('../src/legal.js');
  const fake = createFakeSupabase({ session: { user: { id: 'u6', email: 'f@example.com' } } });
  fake.tables.profiles.push({ ...profileRow('u6', 'Fay'), terms_version: '2020-01-01' });
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow(), storage: null });
  await auth.init();
  assert.equal(await auth.termsAccepted(), false);

  fake.fail('rpc', 'accept_terms', 'offline');
  assert.equal(await auth.acceptTerms(), false);
  assert.equal(auth.state().error, 'offline');
  assert.equal(await auth.acceptTerms(), true);
  assert.equal(auth.state().profile.terms_version, TERMS_VERSION);
  assert.equal(await auth.termsAccepted(), true);
});

test('deleting the account removes it server-side and signs out', async () => {
  const fake = createFakeSupabase({ session: { user: { id: 'u7', email: 'g@example.com' } } });
  fake.tables.profiles.push(profileRow('u7', 'Gus'), profileRow('other', 'Other'));
  fake.tables.runs.push({ id: 'r1', user_id: 'u7' }, { id: 'r2', user_id: 'other' });
  fake.tables.run_answers.push({ run_id: 'r1', user_id: 'u7', idx: 0 });
  const auth = createAuth({ getClient: async () => fake, win: fakeWindow(), storage: null });
  await auth.init();

  fake.fail('rpc', 'delete_my_account', 'server down');
  assert.equal(await auth.deleteAccount(), false);
  assert.match(auth.state().error, /Could not delete your account: server down/);
  assert.equal(auth.state().status, 'signed-in');

  assert.equal(await auth.deleteAccount(), true);
  assert.equal(auth.state().status, 'signed-out');
  assert.match(auth.state().notice, /deleted/);
  assert.deepEqual(fake.tables.profiles.map((p) => p.id), ['other']);
  assert.deepEqual(fake.tables.runs.map((r) => r.id), ['r2']);
  assert.equal(fake.tables.run_answers.length, 0);
  assert.deepEqual(fake.auth.calls.at(-1), ['signOut', { scope: 'local' }]);
});
