import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { QUESTION_LIBRARY } from '../questions.js';

const serverDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Ask the OS for a port nobody is using, so parallel runs never collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, child, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return res;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error('server did not start in time');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Boot `node server.mjs` on a free port and tear it down when the test ends. */
async function startServer(t) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(serverDir, 'server.mjs')], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => {
    child.kill('SIGTERM');
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base, child);
  return base;
}

test('GET /health reports the library size', async (t) => {
  const base = await startServer(t);

  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.deepEqual(await res.json(), { ok: true, questions: QUESTION_LIBRARY.questions.length });
});

test('GET /questions serves the whole library', async (t) => {
  const base = await startServer(t);

  const res = await fetch(`${base}/questions`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.version, QUESTION_LIBRARY.version);
  assert.deepEqual(body.categories, QUESTION_LIBRARY.categories);
  assert.equal(body.questions.length, QUESTION_LIBRARY.questions.length);
  for (const question of body.questions) {
    assert.ok(question.id && question.prompt && question.answer, `incomplete question ${question.id}`);
    assert.ok(QUESTION_LIBRARY.categories.includes(question.category));
  }
});

test('GET /questions?category=... filters to that category', async (t) => {
  const base = await startServer(t);

  for (const category of QUESTION_LIBRARY.categories) {
    const res = await fetch(`${base}/questions?category=${category}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.categories, [category]);
    assert.ok(body.questions.length > 0, `no questions for ${category}`);
    assert.deepEqual(
      body.questions.map((q) => q.id),
      QUESTION_LIBRARY.questions.filter((q) => q.category === category).map((q) => q.id),
    );
  }
});

test('unknown category is a 400 and unknown path a 404', async (t) => {
  const base = await startServer(t);

  const bad = await fetch(`${base}/questions?category=nope`);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /unknown category/);

  const missing = await fetch(`${base}/nowhere`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not found' });
});
