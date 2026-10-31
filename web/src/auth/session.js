import { getSupabase } from '../supabase.js';
import { PENDING_TERMS_KEY, TERMS_VERSION, needsTermsAcceptance } from '../legal.js';
import {
  authRedirectUrl,
  capacitorPlugin,
  isNativePlatform,
  parseAuthCallback,
  stripAuthParams,
} from './redirect.js';

/**
 * Account state for the whole app: email magic link and Google sign-in, session
 * restore on load, sign-out and the user's profile (display name).
 *
 *   status: 'loading' | 'unconfigured' | 'signed-out' | 'signed-in'
 *
 * 'unconfigured' means no Supabase env vars: the app is local-only and nothing
 * here touches the network.
 *
 * @typedef {object} AuthState
 * @property {'loading'|'unconfigured'|'signed-out'|'signed-in'} status
 * @property {{id:string,email?:string}|null} user
 * @property {{id:string,display_name:string,is_admin:boolean}|null} profile
 * @property {string|null} error   last sign-in problem, for the account screen
 * @property {string|null} notice  e.g. "check your inbox"
 * @property {boolean} offline     signed out only because the session could not be
 *                                 refreshed (no network); not a real sign-out
 */

const PROFILE_COLUMNS = 'id, display_name, is_admin, created_at, terms_version, terms_accepted_at';
export const DISPLAY_NAME_MAX = 40;

function message(error) {
  return error?.message || String(error);
}

function storageOf(win) {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null; // e.g. storage blocked by the browser
  }
}

/**
 * @param {object} [options]
 * @param {() => Promise<object|null>} [options.getClient]  supabase client loader (null = not configured)
 * @param {Window} [options.win]
 * @param {Storage|null} [options.storage]  where a consent ticked before sign-in waits
 */
export function createAuth({ getClient = () => getSupabase(), win = globalThis.window, storage = storageOf(win) } = {}) {
  const native = isNativePlatform(win);
  const listeners = new Set();
  /** @type {AuthState} */
  let state = { status: 'loading', user: null, profile: null, error: null, notice: null, offline: false };
  let client = null;
  let initPromise = null;
  let profileLoad = Promise.resolve();

  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  }

  const pendingTerms = () => storage?.getItem(PENDING_TERMS_KEY) ?? null;

  async function recordTerms(version) {
    const { error } = await client.rpc('accept_terms', { p_version: version });
    if (error) return error;
    if (state.profile) {
      set({ profile: { ...state.profile, terms_version: version, terms_accepted_at: new Date().toISOString() } });
    }
    return null;
  }

  async function loadProfile(user) {
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    if (error) console.warn('could not load the profile', error);
    if (state.user?.id !== user.id) return;
    set({ profile: data ?? null });
    // Consent ticked on the sign-in screen: record it now that the profile exists.
    const pending = pendingTerms();
    if (data && pending === TERMS_VERSION) {
      const failed = data.terms_version === pending ? null : await recordTerms(pending);
      if (failed) console.warn('could not record the terms acceptance', failed);
      else storage?.removeItem(PENDING_TERMS_KEY);
    } else if (pending && pending !== TERMS_VERSION) {
      storage?.removeItem(PENDING_TERMS_KEY); // ticked for an older version
    }
  }

  async function applySession(session, { offline = false } = {}) {
    const user = session?.user ?? null;
    if (!user) {
      if (state.status !== 'signed-out' || state.user || state.offline !== offline) {
        set({ status: 'signed-out', user: null, profile: null, offline });
      }
      return;
    }
    if (state.status === 'signed-in' && state.user?.id === user.id) {
      state = { ...state, user }; // token refresh: same account, nothing to redraw
      return;
    }
    // Assigned before set(): listeners (the run store) may ask termsAccepted() straight away.
    profileLoad = Promise.resolve().then(() => loadProfile(user));
    set({ status: 'signed-in', user, profile: null, error: null, notice: null, offline: false });
    await profileLoad;
  }

  /** Android: the deep link carrying `?code=` (or an error) back from the browser. */
  async function handleNativeUrl(url) {
    const callback = parseAuthCallback(url);
    if (!callback) return false;
    capacitorPlugin('Browser', win)?.close?.()?.catch?.(() => {});
    if (callback.error) {
      set({ error: callback.error });
      return true;
    }
    const { error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) set({ error: message(error) });
    return true;
  }

  async function listenForNativeLinks() {
    const App = capacitorPlugin('App', win);
    if (!App) {
      console.warn('@capacitor/app is missing; sign-in links cannot reach the app');
      return;
    }
    await App.addListener('appUrlOpen', ({ url }) => {
      void handleNativeUrl(url);
    });
    // Cold start: the app was launched by the sign-in link itself.
    const launch = await App.getLaunchUrl?.().catch(() => null);
    if (launch?.url) await handleNativeUrl(launch.url);
  }

  async function initialize() {
    client = await getClient();
    if (!client) {
      set({ status: 'unconfigured' });
      return;
    }
    // Web: supabase-js exchanges `?code=` while it initialises (detectSessionInUrl),
    // and getSession() waits for that.
    const callback = native || !win?.location ? null : parseAuthCallback(win.location.href);
    client.auth.onAuthStateChange((event, session) => {
      // getSession() below handles the initial one, and can tell "offline" from "signed out".
      if (event === 'INITIAL_SESSION') return;
      void applySession(session);
    });
    const { data, error } = await client.auth.getSession();
    // An expired session that could not be refreshed: supabase-js keeps it and
    // retries, so this device is still signed in as far as its runs are concerned.
    const offline = !data?.session && Boolean(error) && !callback;
    if (offline) {
      win?.addEventListener?.(
        'online',
        () => {
          void client.auth.getSession().then(({ data: again }) => {
            if (again?.session) void applySession(again.session);
          });
        },
        { once: true },
      );
    }
    if (callback) {
      win.history?.replaceState?.(null, '', stripAuthParams(win.location.href));
      if (callback.error || error) {
        set({
          error:
            callback.error ??
            `${message(error)}. Open the sign-in link in the browser you requested it from, or ask for a new one.`,
        });
      }
      await applySession(data?.session);
      if (win.location.hash !== '#/account') win.location.hash = '#/account';
    } else {
      await applySession(data?.session, { offline });
    }
    if (native) await listenForNativeLinks();
  }

  const redirectTo = () => authRedirectUrl({ native, location: win?.location });

  return {
    /** Restore the session (and finish a sign-in redirect). Safe to call more than once. */
    init() {
      initPromise ??= initialize().catch((err) => {
        console.warn('sign-in is unavailable', err);
        set({ status: client ? 'signed-out' : 'unconfigured', error: client ? message(err) : null });
      });
      return initPromise;
    },
    state: () => state,
    /** The supabase client once init() has resolved, or null when local-only. */
    client: () => client,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signInWithEmail(email) {
      const address = String(email ?? '').trim();
      if (!client) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        set({ error: 'Enter a valid email address.', notice: null });
        return false;
      }
      set({ error: null, notice: null });
      const { error } = await client.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      });
      if (error) {
        set({ error: message(error) });
        return false;
      }
      set({ notice: `Check ${address} for a sign-in link.` });
      return true;
    },
    async signInWithGoogle() {
      if (!client) return false;
      set({ error: null, notice: null });
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        // In the app, open Google in a Custom Tab ourselves; on the web supabase-js navigates.
        options: { redirectTo: redirectTo(), skipBrowserRedirect: native },
      });
      if (error) {
        set({ error: message(error) });
        return false;
      }
      if (native && data?.url) {
        const Browser = capacitorPlugin('Browser', win);
        if (Browser) await Browser.open({ url: data.url });
        else win.open(data.url, '_system');
      }
      return true;
    },
    async signOut() {
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) console.warn('sign-out failed on the server; signing out locally', error);
      await applySession(null);
    },
    /** Ticked (or unticked) on the sign-in screen, before there is an account to record it on. */
    setPendingTerms(accepted) {
      if (accepted) storage?.setItem(PENDING_TERMS_KEY, TERMS_VERSION);
      else storage?.removeItem(PENDING_TERMS_KEY);
    },
    hasPendingTerms: () => pendingTerms() === TERMS_VERSION,
    /** Signed in: agree to the current Terms & Privacy version. */
    async acceptTerms() {
      if (!client || !state.user) return false;
      const error = await recordTerms(TERMS_VERSION);
      if (error) {
        set({ error: message(error), notice: null });
        return false;
      }
      set({ error: null });
      return true;
    },
    /** Whether the signed-in account agreed to the current terms (waits for the profile). */
    async termsAccepted() {
      if (!client || state.status !== 'signed-in') return false;
      await profileLoad;
      if (!state.profile && state.user) {
        profileLoad = loadProfile(state.user);
        await profileLoad;
      }
      return Boolean(state.profile) && !needsTermsAcceptance(state.profile);
    },
    /** Permanently delete the account and everything stored with it, then sign out. */
    async deleteAccount() {
      if (!client || !state.user) return false;
      set({ error: null, notice: null });
      const { error } = await client.rpc('delete_my_account');
      if (error) {
        set({ error: `Could not delete your account: ${message(error)}` });
        return false;
      }
      // The user no longer exists, so the server may reject the sign-out; drop the session anyway.
      const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
      if (signOutError) console.warn('local sign-out after deletion failed', signOutError);
      await applySession(null);
      set({ notice: 'Your account and everything stored with it have been deleted.' });
      return true;
    },
    async updateDisplayName(name) {
      const displayName = String(name ?? '').trim();
      if (!client || !state.user) return false;
      if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
        set({ error: `Display name must be 1–${DISPLAY_NAME_MAX} characters.`, notice: null });
        return false;
      }
      const { data, error } = await client
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', state.user.id)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) {
        set({ error: message(error), notice: null });
        return false;
      }
      set({ profile: data, error: null, notice: 'Display name saved.' });
      return true;
    },
    /** Tests and the Android bridge: feed a deep link in by hand. */
    handleNativeUrl: (url) => (client ? handleNativeUrl(url) : Promise.resolve(false)),
  };
}
