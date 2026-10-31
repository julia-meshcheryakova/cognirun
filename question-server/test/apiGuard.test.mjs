import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guard, originAllowed, clientIp, createRateLimiter, LIMITS } from '../apiGuard.js';

test('origins: the app, its previews, the Android WebView, dev, and the same host', () => {
  for (const o of [
    'https://cognirun.vercel.app',
    'https://cognirun-abc123-personal-0561.vercel.app',
    'https://cognirun.pages.dev',
    'https://feat-x.cognirun.pages.dev',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
  ]) {
    assert.ok(originAllowed(o), o);
  }
  assert.ok(originAllowed('https://cognirun.app', 'cognirun.app'));
  assert.ok(originAllowed('https://beta.example', '', 'https://x.example, https://beta.example'));
  for (const o of ['', null, 'https://evil.example', 'https://cognirun.vercel.app.evil.example', 'http://cognirun.pages.dev', 'not a url']) {
    assert.equal(originAllowed(o, 'cognirun.vercel.app'), false, String(o));
  }
});

test('client IP prefers Cloudflare, then the first forwarded hop', () => {
  const h = (map) => (name) => map[name];
  assert.equal(clientIp(h({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })), '1.1.1.1');
  assert.equal(clientIp(h({ 'x-forwarded-for': '2.2.2.2, 10.0.0.1' })), '2.2.2.2');
  assert.equal(clientIp(h({})), 'unknown');
});

test('rate limit: per key, per minute, then resets', () => {
  let t = 0;
  const take = createRateLimiter({ now: () => t });
  assert.ok(take('a', 2).ok);
  assert.ok(take('a', 2).ok);
  const third = take('a', 2);
  assert.equal(third.ok, false);
  assert.equal(third.retryAfter, 60);
  assert.ok(take('b', 2).ok);
  t = 60_000;
  assert.ok(take('a', 2).ok);
});

test('guard: method, origin, size and rate decisions', () => {
  const limiter = createRateLimiter({ now: () => 0 });
  const base = { method: 'POST', origin: 'https://cognirun.vercel.app', ip: '9.9.9.9', limiter };
  assert.equal(guard('tts', { ...base, method: 'GET' }).status, 405);
  assert.equal(guard('tts', { ...base, origin: 'https://evil.example' }).status, 403);
  assert.equal(guard('tts', { ...base, size: LIMITS.tts.maxBytes + 1 }).status, 413);
  const ok = guard('judge', base);
  assert.equal(ok.ok, true);
  assert.equal(ok.headers['access-control-allow-origin'], 'https://cognirun.vercel.app');
  let last;
  for (let i = 0; i < LIMITS.judge.perMinute; i += 1) last = guard('judge', base);
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers['retry-after']) > 0);
  const pre = guard('stt', { ...base, method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(guard('stt', { ...base, method: 'OPTIONS', origin: 'https://evil.example' }).status, 403);
});