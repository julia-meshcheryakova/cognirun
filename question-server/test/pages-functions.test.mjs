// Cloudflare Pages Functions (functions/) must answer like the Vercel api/ routes.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_LIBRARY } from '../questions.js';
import * as health from '../../functions/health.js';
import * as questions from '../../functions/questions.js';
import * as config from '../../functions/api/config.js';
import * as judge from '../../functions/api/judge.js';
import * as tts from '../../functions/api/tts.js';
import * as stt from '../../functions/api/stt.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const call = (mod, url, init = {}, env = {}) =>
  mod.onRequest({ request: new Request(`https://cognirun.pages.dev${url}`, init), env });

test('health reports the bank size and which keys are set', async () => {
  const res = await call(health, '/health', {}, { GROQ_API_KEY: 'g' });
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await res.json(), {
    ok: true,
    questions: QUESTION_LIBRARY.questions.length,
    eleven: false,
    groq: true,
  });
});

test('questions serves the library, optionally filtered by category', async () => {
  const all = await (await call(questions, '/questions')).json();
  assert.equal(all.questions.length, QUESTION_LIBRARY.questions.length);
  const math = await (await call(questions, '/questions?category=math')).json();
  assert.ok(math.questions.length > 0);
  assert.ok(math.questions.every((q) => q.category === 'math'));
});

test('config reports whether ElevenLabs is configured', async () => {
  assert.deepEqual(await (await call(config, '/api/config')).json(), { elevenLabs: false });
  const on = await call(config, '/api/config', {}, { ELEVENLABS_API_KEY: 'k' });
  assert.deepEqual(await on.json(), { elevenLabs: true });
});

test('judge rejects GET, answers preflight and is 503 without a key', async () => {
  assert.equal((await call(judge, '/api/judge')).status, 405);
  assert.equal((await call(judge, '/api/judge', { method: 'OPTIONS' })).status, 204);
  const res = await call(judge, '/api/judge', { method: 'POST', body: '{}' });
  assert.equal(res.status, 503);
});

test('judge passes the env key to Groq and returns its verdict', async () => {
  const q = QUESTION_LIBRARY.questions[0];
  let auth;
  globalThis.fetch = async (_url, init) => {
    auth = init.headers.authorization ?? init.headers.Authorization;
    return Response.json({ choices: [{ message: { content: '{"correct":true,"reason":"ok"}' } }] });
  };
  const res = await call(
    judge,
    '/api/judge',
    { method: 'POST', body: JSON.stringify({ questionId: q.id, text: q.answer }) },
    { GROQ_API_KEY: 'secret' },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).correct, true);
  assert.match(auth, /secret/);
});

test('tts and stt are 503 without a key and 405 for GET', async () => {
  for (const [mod, path] of [[tts, '/api/tts'], [stt, '/api/stt']]) {
    assert.equal((await call(mod, path)).status, 405);
    assert.equal((await call(mod, path, { method: 'POST', body: '{}' })).status, 503);
  }
});

test('tts proxies ElevenLabs audio', async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /text-to-speech\/voice1/);
    assert.equal(JSON.parse(init.body).text, 'hello');
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };
  const res = await call(
    tts,
    '/api/tts',
    { method: 'POST', body: JSON.stringify({ text: 'hello' }) },
    { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'voice1' },
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await res.arrayBuffer()).byteLength, 3);
});

test('stt rejects tiny bodies and forwards real audio as multipart', async () => {
  const env = { ELEVENLABS_API_KEY: 'k' };
  const tiny = await call(stt, '/api/stt', { method: 'POST', body: new Uint8Array(10) }, env);
  assert.equal(tiny.status, 400);

  let form;
  globalThis.fetch = async (_url, init) => {
    form = init.body;
    return Response.json({ text: 'paris' });
  };
  const res = await call(
    stt,
    '/api/stt',
    {
      method: 'POST',
      body: new Uint8Array(500),
      headers: { 'content-type': 'audio/mp4', 'x-audio-filename': 'a b.m4a' },
    },
    env,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: 'paris' });
  assert.equal(form.get('file').name, 'ab.m4a');
  assert.equal(form.get('file').size, 500);
});
