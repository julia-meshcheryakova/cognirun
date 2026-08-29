import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { exactMatch, judgeAnswer, normalizeAnswer } from '../src/judge.js';

const QUESTION = {
  id: 'trivia-3',
  category: 'trivia',
  prompt: 'What is the capital of Japan?',
  answer: 'Tokyo',
};

/** Groq is OpenAI-compatible: the verdict comes back as JSON in the message. */
function groqStub(verdict, { ok = true, status = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok,
      status,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
    };
  };
  return { fetchImpl, requests };
}

afterEach(() => {
  delete globalThis.COGNIRUN_GROQ_API_KEY;
});

test('normalization ignores case, punctuation and filler words', () => {
  assert.equal(normalizeAnswer("  It's Tokyo!  "), 'tokyo');
  assert.equal(exactMatch('tokyo.', QUESTION), true);
  assert.equal(exactMatch('I think the answer is Tokyo', QUESTION), true);
  assert.equal(exactMatch('Kyoto', QUESTION), false);
  assert.equal(exactMatch('', QUESTION), false);
});

test('an exact match is graded without calling the LLM', async () => {
  const { fetchImpl, requests } = groqStub({ correct: false });

  const verdict = await judgeAnswer({
    question: QUESTION,
    text: 'Tokyo',
    key: 'gsk-test',
    fetchImpl,
  });

  assert.deepEqual({ correct: verdict.correct, method: verdict.method }, {
    correct: true,
    method: 'exact',
  });
  assert.equal(requests.length, 0);
});

test('a semantically correct answer is accepted by the LLM judge', async () => {
  const { fetchImpl, requests } = groqStub({ correct: true, reason: 'Same meaning' });

  const verdict = await judgeAnswer({
    question: { ...QUESTION, prompt: 'What game is he playing?', answer: 'Monopoly' },
    text: 'he is playing Monopoly',
    key: 'gsk-test',
    fetchImpl,
  });

  assert.equal(verdict.correct, true);
  assert.equal(verdict.method, 'llm');
  assert.equal(verdict.reason, 'Same meaning');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions$/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer gsk-test');
  const body = JSON.parse(requests[0].options.body);
  assert.match(body.messages[1].content, /Expected answer: Monopoly/);
  assert.match(body.messages[1].content, /<<<ANSWER\nhe is playing Monopoly\nANSWER>>>/);
});

test('a wrong answer is rejected by the LLM judge', async () => {
  const { fetchImpl } = groqStub({ correct: false, reason: 'Different city' });

  const verdict = await judgeAnswer({
    question: QUESTION,
    text: 'Kyoto probably',
    key: 'gsk-test',
    fetchImpl,
  });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'llm');
});

test('without a Groq key only exact matches count', async () => {
  const { fetchImpl, requests } = groqStub({ correct: true });

  const verdict = await judgeAnswer({
    question: QUESTION,
    text: 'the city of Tokyo',
    key: '',
    fetchImpl,
  });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'exact-only');
  assert.equal(requests.length, 0);
});

test('a failing judge request degrades to exact match only', async () => {
  const { fetchImpl } = groqStub({ correct: true }, { ok: false, status: 429 });

  const verdict = await judgeAnswer({
    question: QUESTION,
    text: 'somewhere in Japan',
    key: 'gsk-test',
    fetchImpl,
  });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'exact-only');
  assert.match(verdict.reason, /429/);
});

test('an empty answer is wrong and never reaches the judge', async () => {
  const { fetchImpl, requests } = groqStub({ correct: true });

  const verdict = await judgeAnswer({ question: QUESTION, text: '   ', key: 'gsk-test', fetchImpl });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'empty');
  assert.equal(requests.length, 0);
});

test('the key can be supplied at runtime instead of via the env', async () => {
  const { fetchImpl, requests } = groqStub({ correct: true });
  globalThis.COGNIRUN_GROQ_API_KEY = 'gsk-runtime';

  const verdict = await judgeAnswer({ question: QUESTION, text: 'a place in Japan', fetchImpl });

  assert.equal(verdict.correct, true);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer gsk-runtime');
});
