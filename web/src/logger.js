/**
 * Sends uncaught errors to Supabase (log_client_error RPC) so crashes on
 * people's devices are visible. Best effort and quiet: a few distinct reports
 * per page load, nothing when Supabase is not configured or on localhost, and
 * a failed report never throws.
 */

const IGNORED = [/^Script error\.?$/i, /ResizeObserver loop/i];

/** Path and route only: the query string can carry a sign-in code. */
export function safeUrl(loc) {
  if (!loc) return null;
  const route = String(loc.hash ?? '').split('?')[0];
  return `${loc.pathname ?? ''}${route}`.slice(0, 300) || null;
}

function describe(value) {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack };
  if (value && typeof value === 'object' && 'message' in value) {
    return { message: String(value.message), stack: value.stack ? String(value.stack) : undefined };
  }
  return { message: String(value ?? '') };
}

/**
 * @param {object} options
 * @param {() => Promise<object|null>} options.getClient  the Supabase client, or null
 * @param {string} [options.version]
 * @param {Window} [options.win]
 * @param {number} [options.maxReports]  per page load
 */
export function createErrorReporter({ getClient, version = '', win = globalThis.window, maxReports = 5 }) {
  const seen = new Set();
  let sent = 0;

  async function report(error, level = 'error') {
    const { message, stack } = describe(error);
    const text = message.trim().slice(0, 500);
    if (!text || IGNORED.some((re) => re.test(text))) return false;
    if (seen.has(text) || sent >= maxReports) return false;
    seen.add(text);
    sent += 1;
    try {
      const client = await getClient();
      if (!client) return false;
      const { error: rpcError } = await client.rpc('log_client_error', {
        p_level: level,
        p_message: text,
        p_stack: stack ? String(stack).slice(0, 4000) : null,
        p_url: safeUrl(win?.location),
        p_app_version: version || null,
        p_user_agent: win?.navigator?.userAgent?.slice(0, 300) ?? null,
      });
      return !rpcError;
    } catch {
      return false;
    }
  }

  function install() {
    const loc = win?.location;
    // Dev and e2e run on http://localhost; the Android app is https://localhost and does report.
    const local = loc?.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(loc.hostname ?? '');
    if (!win?.addEventListener || local) return false;
    win.addEventListener('error', (event) => void report(event.error ?? event.message));
    win.addEventListener('unhandledrejection', (event) => void report(event.reason));
    return true;
  }

  return { report, install };
}
