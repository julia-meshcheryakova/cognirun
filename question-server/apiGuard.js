// Shared protection for the paid endpoints (/api/tts, /api/stt, /api/judge) on
// every host: Vercel (api/), Cloudflare Pages (functions/), Render (serve-app.mjs)
// and the local dev server. Browsers always send Origin on POST, so a missing or
// foreign Origin means another site or a script. The rate limit is per instance
// (best effort); a durable shared limit is a later step.

const ORIGINS = new Set([
  'https://cognirun.vercel.app',
  'https://cognirun.pages.dev',
  'https://cognirun-app.onrender.com',
  'https://localhost', // Android WebView (Capacitor)
  'capacitor://localhost', // iOS WebView (Capacitor)
]);
const ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.cognirun\.pages\.dev$/, // Cloudflare previews
  /^https:\/\/cognirun-[a-z0-9-]+\.vercel\.app$/, // Vercel previews
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, // local dev and e2e
];

/** Per-minute requests per client IP, and the largest accepted body. */
export const LIMITS = {
  tts: { perMinute: 40, maxBytes: 16 * 1024 },
  stt: { perMinute: 30, maxBytes: 2 * 1024 * 1024 },
  judge: { perMinute: 60, maxBytes: 16 * 1024 },
};
export const MAX_TTS_CHARS = 1000;

export function originAllowed(origin, host = '', extra = '') {
  if (!origin) return false;
  if (ORIGINS.has(origin) || ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  const listed = String(extra)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (listed.includes(origin)) return true;
  try {
    return Boolean(host) && new URL(origin).host === host; // same site, any domain
  } catch {
    return false;
  }
}

export function corsHeaders(origin, allowed, allowHeaders = 'content-type') {
  const headers = { vary: 'origin', 'access-control-allow-headers': allowHeaders };
  if (allowed) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return headers;
}

export function clientIp(get) {
  const forwarded = String(get('x-forwarded-for') || '').split(',')[0].trim();
  return get('cf-connecting-ip') || forwarded || get('x-real-ip') || 'unknown';
}

export function createRateLimiter({ now = Date.now } = {}) {
  const windows = new Map();
  return function take(key, perMinute) {
    const t = now();
    let entry = windows.get(key);
    if (!entry || t - entry.start >= 60_000) {
      entry = { start: t, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (t - v.start >= 60_000) windows.delete(k);
    }
    return {
      ok: entry.count <= perMinute,
      retryAfter: Math.max(1, Math.ceil((entry.start + 60_000 - t) / 1000)),
    };
  };
}

const sharedLimiter = createRateLimiter();

/**
 * Decide whether a paid-endpoint request may proceed.
 * @param {'tts'|'stt'|'judge'} kind
 * @param {{ method: string, origin?: string|null, host?: string, ip?: string,
 *   size?: number|string|null, extraOrigins?: string, allowHeaders?: string,
 *   limiter?: ReturnType<typeof createRateLimiter> }} req
 * @returns {{ ok: boolean, status?: number, body?: object, headers: Record<string,string> }}
 */
export function guard(kind, req) {
  const origin = req.origin || '';
  const allowed = originAllowed(origin, req.host, req.extraOrigins);
  const headers = corsHeaders(origin, allowed, req.allowHeaders);
  const fail = (status, error, extra = {}) => ({ ok: false, status, body: { error }, headers: { ...headers, ...extra } });

  if (req.method === 'OPTIONS') return { ok: false, status: allowed ? 204 : 403, body: null, headers };
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (!allowed) return fail(403, 'origin not allowed');
  const limit = LIMITS[kind];
  if (req.size != null && Number(req.size) > limit.maxBytes) return fail(413, 'request too large');
  const { ok, retryAfter } = (req.limiter ?? sharedLimiter)(`${kind}:${req.ip || 'unknown'}`, limit.perMinute);
  if (!ok) return fail(429, 'too many requests', { 'retry-after': String(retryAfter) });
  return { ok: true, headers };
}
