#!/usr/bin/env node
/**
 * Post-deploy smoke check against the live site (default: production).
 *
 *   npm run smoke:prod
 *   SMOKE_URL=https://preview-url.vercel.app npm run smoke:prod
 */
const base = (process.env.SMOKE_URL ?? 'https://cognirun.vercel.app').replace(/\/$/, '');
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

/** @type {Pick<Response, 'ok' | 'statusText'> & Partial<Pick<Response, 'status' | 'json'>>} */
const health = await fetch(`${base}/health`).catch((err) => ({ ok: false, statusText: err.message }));
check(health.ok, `GET /health -> ${health.status ?? health.statusText}`);
if (health.ok) {
  const body = await health.json();
  check(body.groq === true, `judge configured (GROQ_API_KEY set): ${body.groq}`);
  check(body.eleven === true, `voice configured (ELEVENLABS_API_KEY set): ${body.eleven}`);
}

const html = await (await fetch(base)).text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
check(scripts.length > 0, `index.html references ${scripts.length} script(s)`);
for (const src of scripts) {
  const js = await (await fetch(src)).text();
  check(!/gsk_[A-Za-z0-9]{10}/.test(js) && !js.includes('api.groq.com'), `${src} has no Groq key`);
}

const judge = await fetch(`${base}/api/judge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin },
  body: JSON.stringify({ questionId: 'logic-1', text: 'no it does not follow' }),
});
check([200, 503].includes(judge.status), `POST /api/judge -> ${judge.status}`);

const foreign = await fetch(`${base}/api/judge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
  body: '{}',
});
check(foreign.status === 403, `POST /api/judge from a foreign origin -> ${foreign.status} (want 403)`);

const page = await fetch(base);
check(/script-src 'self'/.test(page.headers.get('content-security-policy') ?? ''), 'Content-Security-Policy header present');

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed against ${base}`);
  process.exit(1);
}
console.log(`\nSmoke passed against ${base}`);
