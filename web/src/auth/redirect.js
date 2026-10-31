/**
 * Where sign-in redirects land and how the result is read back. Pure helpers
 * (no Supabase), shared by the web and the Android app.
 *
 * Web: the redirect goes back to this page (`origin + pathname`) with `?code=`
 * (PKCE). supabase-js exchanges it on load; auth/session.js then strips it from
 * the URL and opens #/account.
 *
 * Android (Capacitor): the redirect is the custom scheme below. The manifest's
 * intent-filter routes it to the app, @capacitor/app emits `appUrlOpen`, and
 * auth/session.js exchanges the code. Google sign-in is opened with
 * @capacitor/browser (a Custom Tab) because Google blocks OAuth in WebViews.
 */
export const NATIVE_AUTH_REDIRECT = 'com.cognirun.app://auth-callback';

/** @param {Window} [win] */
export function isNativePlatform(win = globalThis.window) {
  return Boolean(win?.Capacitor?.isNativePlatform?.());
}

/**
 * A Capacitor plugin registered on window.Capacitor.Plugins, or null on the web.
 * @template {keyof CapacitorPlugins} K
 * @param {K} name
 * @param {Window} [win]
 * @returns {CapacitorPlugins[K] | null}
 */
export function capacitorPlugin(name, win = globalThis.window) {
  return win?.Capacitor?.Plugins?.[name] ?? null;
}

export function authRedirectUrl({ native, location }) {
  if (native) return NATIVE_AUTH_REDIRECT;
  return `${location.origin}${location.pathname}`;
}

function callbackParams(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const params = new URLSearchParams(parsed.search);
  // Errors can come back in the fragment; '#/account' style fragments are routes.
  const hash = parsed.hash.replace(/^#/, '');
  if (hash && !hash.startsWith('/')) {
    new URLSearchParams(hash).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return { parsed, params };
}

/** `{ code, error }` when `url` is a sign-in redirect, otherwise null. */
export function parseAuthCallback(url) {
  const result = callbackParams(url);
  if (!result) return null;
  const { params } = result;
  const code = params.get('code');
  const error = params.get('error_description') || params.get('error');
  if (!code && !error) return null;
  return { code: code || null, error: error || null };
}

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'state'];

/** The same URL as path + query + route, without the sign-in parameters. */
export function stripAuthParams(url) {
  const result = callbackParams(url);
  if (!result) return url;
  const { parsed } = result;
  AUTH_PARAMS.forEach((key) => parsed.searchParams.delete(key));
  const hash = parsed.hash.startsWith('#/') ? parsed.hash : '';
  return `${parsed.pathname}${parsed.search}${hash}`;
}
