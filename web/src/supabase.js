/**
 * The Supabase client, created lazily from VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY. When either is unset the app is local-only: every
 * caller gets `null` and supabase-js is never downloaded (it is a dynamic
 * import, so it lives in its own chunk).
 */
import { isNativePlatform } from './auth/redirect.js';

const viteEnv = import.meta.env ?? {};

export function supabaseConfig(env = viteEnv) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return url && anonKey ? { url, anonKey } : null;
}

export function isSupabaseConfigured(env = viteEnv) {
  return supabaseConfig(env) !== null;
}

let clientPromise = null;

/**
 * @param {object} [options]
 * @param {object} [options.env]   import.meta.env by default
 * @param {() => Promise<{createClient: Function}>} [options.load]  the supabase-js module loader
 * @param {boolean} [options.native]  running inside the Capacitor app
 * @returns {Promise<object|null>} the shared client, or null when not configured
 */
export function getSupabase({
  env = viteEnv,
  load = () => import('@supabase/supabase-js'),
  native = isNativePlatform(),
} = {}) {
  const config = supabaseConfig(env);
  if (!config) return Promise.resolve(null);
  clientPromise ??= load()
    .then(({ createClient }) =>
      createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // PKCE returns `?code=` (not tokens in the #fragment, which is our router's).
          flowType: 'pkce',
          // In the Android app the code arrives through a deep link instead (auth/session.js).
          detectSessionInUrl: !native,
        },
      }),
    )
    .catch((err) => {
      clientPromise = null;
      console.warn('could not load Supabase; staying local-only', err);
      return null;
    });
  return clientPromise;
}

/** Tests only: forget the shared client. */
export function resetSupabaseForTests() {
  clientPromise = null;
}
