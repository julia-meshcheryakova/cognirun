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

test('a sentence that negates the answer is wrong', async () => {
  const question = { prompt: 'What game is he playing?', answer: 'Monopoly' };

  assert.equal(containsAnswer('it is not Tokyo', QUESTION), false);
  assert.equal(containsAnswer('Tokyo is wrong', QUESTION), false);
  assert.equal(containsAnswer("I don't think he is playing Monopoly", question), false);
  assert.equal((await judgeAnswer({ question: QUESTION, text: 'not Tokyo' })).method, 'no-match');
});

test('a negative expected answer still grades as correct', async () => {
  const question = { prompt: 'Does it follow?', answer: 'No', acceptedAnswers: ['it does not follow'] };

  assert.equal((await judgeAnswer({ question, text: 'No' })).correct, true);
  assert.equal(containsAnswer('no, it does not follow', question), true);
});

test('a negation aimed at another option leaves the answer correct', () => {
  assert.equal(containsAnswer('Tokyo, not Kyoto', QUESTION), true);
  assert.equal(containsAnswer('not Kyoto, Tokyo', QUESTION), true);
  assert.equal(containsAnswer('Tokyo is not wrong', QUESTION), true);
});

test('a rejected negative answer is wrong', () => {
  const question = { prompt: 'Does it follow?', answer: 'No' };

  assert.equal(containsAnswer('No is wrong', question), false);
});

test('a rejection in its own clause still rejects the answer', () => {
  assert.equal(containsAnswer('Tokyo, which is wrong', QUESTION), false);
  assert.equal(containsAnswer('Tokyo; that is incorrect', QUESTION), false);
  assert.equal(containsAnswer('every city except Tokyo', QUESTION), false);
});
