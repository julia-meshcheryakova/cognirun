import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_MODEL, GROQ_ENDPOINT, judgeRequest } from '../llmJudge.js';

function groqStub(reply, calls) {
  return async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    };
  };
}

test('without a key the judge reports it is not configured', async () => {
  const { status } = await judgeRequest({ questionId: 'trivia-1', text: 'x' }, { key: '' });
  assert.equal(status, 503);
});

test('the question is looked up server-side; unknown ids and empty text are rejected', async () => {
  const calls = [];
  const fetchImpl = groqStub({ correct: true, reason: 'ok' }, calls);

  const unknown = await judgeRequest({ questionId: 'nope', text: 'x' }, { key: 'k', fetchImpl });
  assert.equal(unknown.status, 400);
  const empty = await judgeRequest({ questionId: 'trivia-1', text: '  ' }, { key: 'k', fetchImpl });
  assert.equal(empty.status, 400);
  assert.equal(calls.length, 0);
});

test('a known question is graded by Groq with the key from the server environment', async () => {
  const calls = [];
  const { status, body } = await judgeRequest(
    { questionId: 'trivia-1', text: 'some paraphrase' },
    { key: 'server-key', fetchImpl: groqStub({ correct: true, reason: 'synonym' }, calls) },
  );

  assert.equal(status, 200);
  assert.deepEqual(body, { correct: true, reason: 'synonym' });
  assert.equal(calls[0].url, GROQ_ENDPOINT);
  assert.equal(calls[0].headers.Authorization, 'Bearer server-key');
  assert.equal(calls[0].body.model, DEFAULT_MODEL);
  assert.match(calls[0].body.messages[1].content, /some paraphrase/);
});

test('an upstream failure is a 502, never a verdict', async () => {
  const { status, body } = await judgeRequest(
    { questionId: 'trivia-1', text: 'x' },
    { key: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) },
  );
  assert.equal(status, 502);
  assert.match(body.error, /401/);
});
