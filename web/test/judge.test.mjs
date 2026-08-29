import assert from 'node:assert/strict';
import test from 'node:test';

import { containsAnswer, exactMatch, judgeAnswer, normalizeAnswer } from '../src/judge.js';

const QUESTION = {
  id: 'trivia-3',
  category: 'trivia',
  prompt: 'What is the capital of Japan?',
  answer: 'Tokyo',
};

test('normalization ignores case, punctuation and filler words', () => {
  assert.equal(normalizeAnswer("  It's Tokyo!  "), 'tokyo');
  assert.equal(exactMatch('tokyo.', QUESTION), true);
  assert.equal(exactMatch('I think the answer is Tokyo', QUESTION), true);
  assert.equal(exactMatch('Kyoto', QUESTION), false);
  assert.equal(exactMatch('', QUESTION), false);
});

test('accepted aliases grade as exact matches', () => {
  const question = { ...QUESTION, answer: 'Tokyo', acceptedAnswers: ['Tokio', 'Edo'] };
  assert.equal(exactMatch('edo', question), true);
  assert.equal(exactMatch('Osaka', question), false);
});

test('a spoken sentence containing the answer is correct', async () => {
  const question = { prompt: 'What game is he playing?', answer: 'Monopoly' };

  assert.equal(containsAnswer('he is playing Monopoly with his sister', question), true);
  const verdict = await judgeAnswer({ question, text: 'he is playing Monopoly with his sister' });
  assert.equal(verdict.correct, true);
  assert.equal(verdict.method, 'contains');
});

test('a multi-word answer must appear as a run of words', async () => {
  const question = { prompt: 'What is he doing?', answer: 'playing chess' };

  assert.equal(containsAnswer('I think he is playing chess right now', question), true);
  assert.equal(containsAnswer('he is playing and I saw a chess board', question), false);
});

test('a wrong answer scores nothing and says why', async () => {
  const verdict = await judgeAnswer({ question: QUESTION, text: 'Kyoto probably' });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'no-match');
  assert.match(verdict.reason, /does not match/i);
});

test('an answer that only mentions the topic is wrong', async () => {
  const verdict = await judgeAnswer({ question: QUESTION, text: 'somewhere in Japan' });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'no-match');
});

test('an empty answer is wrong', async () => {
  const verdict = await judgeAnswer({ question: QUESTION, text: '   ' });

  assert.equal(verdict.correct, false);
  assert.equal(verdict.method, 'empty');
});

test('grading needs no network access at all', async () => {
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('the judge must not make network calls');
  };
  try {
    assert.equal((await judgeAnswer({ question: QUESTION, text: 'Tokyo' })).correct, true);
  } finally {
    globalThis.fetch = fetchImpl;
  }
});
