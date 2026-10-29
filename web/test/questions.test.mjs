import assert from 'node:assert/strict';
import test from 'node:test';

import { QUESTION_LIBRARY } from '../../question-server/questions.js';
import { CHALLENGE_COURSES, questionCountOf } from '../src/config.js';
import { containsAnswer, exactMatch } from '../src/judge.js';
import {
  RUN_CATEGORIES,
  buildChallengeQuestionSet,
  loadLibrary,
  recentQuestionIds,
  selectQuestions,
  selectRunQuestions,
  selectSoloQuestions,
} from '../src/questions.js';
import { POPULATION, categoryBreakdown, percentileFor } from '../src/percentile.js';

const byId = new Map(QUESTION_LIBRARY.questions.map((q) => [q.id, q]));

test('the bundled library is the whole bank, every category well stocked', () => {
  assert.deepEqual(QUESTION_LIBRARY.categories, RUN_CATEGORIES);
  assert.ok(QUESTION_LIBRARY.questions.length >= 300, `${QUESTION_LIBRARY.questions.length} questions`);

  RUN_CATEGORIES.forEach((category) => {
    const questions = QUESTION_LIBRARY.questions.filter((q) => q.category === category);
    assert.ok(questions.length >= 100, `${category} has ${questions.length} questions`);
  });

  const ids = QUESTION_LIBRARY.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'question ids must be unique');
});

test('the answer judge accepts every answer and rejects every wrong option', () => {
  for (const q of QUESTION_LIBRARY.questions) {
    for (const said of [q.answer, ...(q.acceptedAnswers ?? [])]) {
      assert.ok(exactMatch(said, q), `${q.id}: "${said}" must grade as correct`);
    }
    for (const option of q.options ?? []) {
      if (option === q.answer) continue;
      assert.equal(exactMatch(option, q), false, `${q.id}: option "${option}" grades as correct`);
      assert.equal(containsAnswer(option, q), false, `${q.id}: option "${option}" contains the answer`);
    }
  }
});

test('a run asks one question per category, deterministically', () => {
  const selected = selectRunQuestions(QUESTION_LIBRARY);

  assert.deepEqual(
    selected.map((q) => q.category),
    RUN_CATEGORIES,
  );
  assert.deepEqual(selectRunQuestions(QUESTION_LIBRARY), selected, 'selection must be reproducible');
});

test('seeded selection rotates categories, never repeats and depends only on the seed', () => {
  const pick = (seed, exclude) => selectQuestions({ library: QUESTION_LIBRARY, count: 10, seed, exclude });
  const a = pick('seed-a');

  assert.deepEqual(
    a.map((q) => q.category),
    ['trivia', 'logic', 'math', 'trivia', 'logic', 'math', 'trivia', 'logic', 'math', 'trivia'],
  );
  assert.equal(new Set(a.map((q) => q.id)).size, 10);
  assert.deepEqual(pick('seed-a'), a);
  assert.notDeepEqual(pick('seed-b').map((q) => q.id), a.map((q) => q.id));

  const shuffled = { ...QUESTION_LIBRARY, questions: QUESTION_LIBRARY.questions.slice().reverse() };
  assert.deepEqual(
    selectQuestions({ library: shuffled, count: 10, seed: 'seed-a' }).map((q) => q.id),
    a.map((q) => q.id),
    'bank order must not matter',
  );

  const avoided = pick('seed-a', a.map((q) => q.id));
  assert.ok(avoided.every((q) => !a.some((seen) => seen.id === q.id)), 'excluded ids are avoided');
});

test('selection falls back to excluded questions, then other categories, when it runs short', () => {
  const tiny = {
    questions: [
      { id: 'trivia-a', category: 'trivia', difficulty: 'easy' },
      { id: 'logic-a', category: 'logic', difficulty: 'easy' },
      { id: 'math-a', category: 'math', difficulty: 'easy' },
      { id: 'math-b', category: 'math', difficulty: 'easy' },
    ],
  };
  const ids = selectQuestions({ library: tiny, count: 4, seed: 's', exclude: ['logic-a'] }).map((q) => q.id);
  assert.deepEqual(ids.slice(0, 2), ['trivia-a', 'logic-a'], 'an excluded question beats breaking the rotation');
  assert.deepEqual(ids.slice(2).sort(), ['math-a', 'math-b'], 'another category fills an empty one');
  assert.throws(() => selectQuestions({ library: tiny, count: 5, seed: 's' }), /fewer than 5/);
});

test('a challenge maps to fixed question ids: one per km, rotating, easy to hard', () => {
  for (const course of CHALLENGE_COURSES) {
    const challengeId = `2026-W02-${course}`;
    const ids = buildChallengeQuestionSet({ challengeId, course });
    const questions = ids.map((id) => byId.get(id));

    assert.equal(ids.length, questionCountOf(course), `${course} asks one question per km`);
    assert.equal(new Set(ids).size, ids.length, `${course} repeats a question`);
    assert.deepEqual(buildChallengeQuestionSet({ challengeId, course }), ids, 'deterministic');
    questions.forEach((q, i) => assert.equal(q.category, RUN_CATEGORIES[i % 3], `${course} km ${i + 1}`));

    const level = questions.map((q) => ['easy', 'medium', 'hard'].indexOf(q.difficulty));
    assert.equal(level[0], 0, `${course} starts easy`);
    assert.equal(level.at(-1), 2, `${course} ends hard`);
    level.slice(1).forEach((l, i) => assert.ok(l >= level[i], `${course} difficulty never drops`));
  }
});

test('consecutive weeks of the same length share no question', () => {
  for (const course of CHALLENGE_COURSES) {
    const weeks = ['2025-W52', '2026-W01', '2026-W02', '2026-W03'];
    const sets = weeks.map((week) => buildChallengeQuestionSet({ challengeId: `${week}-${course}`, course }));
    for (let i = 1; i < sets.length; i++) {
      const overlap = sets[i].filter((id) => sets[i - 1].includes(id));
      assert.deepEqual(overlap, [], `${weeks[i - 1]} and ${weeks[i]} ${course} overlap`);
    }
  }
  assert.throws(() => buildChallengeQuestionSet({ challengeId: '', course: '3k' }), /challengeId/);
});

test('solo runs avoid the questions of recent runs', () => {
  const runs = [
    { answers: [{ questionId: 'trivia-1' }, { questionId: 'logic-1' }] },
    { answers: [{ questionId: 'math-1' }, { questionId: 'trivia-1' }] },
  ];
  assert.deepEqual(recentQuestionIds(runs), ['trivia-1', 'logic-1', 'math-1']);
  assert.deepEqual(recentQuestionIds(runs, { limit: 2 }), ['trivia-1', 'logic-1']);

  const seen = new Set();
  const history = [];
  for (let run = 0; run < 20; run++) {
    const questions = selectSoloQuestions({ library: QUESTION_LIBRARY, count: 5, recentRuns: history, seed: run });
    assert.deepEqual(questions.map((q) => q.category), ['trivia', 'logic', 'math', 'trivia', 'logic']);
    questions.forEach((q) => {
      assert.equal(seen.has(q.id), false, `run ${run} repeats ${q.id}`);
      seen.add(q.id);
    });
    history.unshift({ answers: questions.map((q) => ({ questionId: q.id })) });
  }
  assert.notDeepEqual(
    selectSoloQuestions({ library: QUESTION_LIBRARY }).map((q) => q.id),
    selectSoloQuestions({ library: QUESTION_LIBRARY }).map((q) => q.id),
    'unseeded solo runs are random',
  );
});

test('questions load from the server and fall back to the bundled library', async () => {
  const served = { version: 1, categories: RUN_CATEGORIES, questions: QUESTION_LIBRARY.questions };
  const ok = await loadLibrary({
    fetchImpl: async () => ({ ok: true, json: async () => served }),
  });
  assert.equal(ok.source, 'server');

  const down = await loadLibrary({
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
  });
  assert.equal(down.source, 'bundled');
  assert.equal(down.library.questions.length, QUESTION_LIBRARY.questions.length);

  const hanging = await loadLibrary({
    fetchImpl: (url, { signal }) =>
      new Promise((_, reject) => {
        const pending = setTimeout(() => {}, 60_000); // a server that never answers
        signal.addEventListener('abort', () => {
          clearTimeout(pending);
          reject(signal.reason);
        });
      }),
  });
  assert.equal(hanging.source, 'bundled', 'a server that never answers must not block the run');

  const partial = await loadLibrary({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ...served, questions: served.questions.filter((q) => q.category === 'trivia') }),
    }),
  });
  assert.equal(partial.source, 'bundled', 'a library missing a category must not reach the run');
  assert.deepEqual(selectRunQuestions(partial.library).map((q) => q.category), RUN_CATEGORIES);
});

test('percentiles rise with the score and stay within 1-99%', () => {
  RUN_CATEGORIES.forEach((category) => {
    const { mean } = POPULATION[category];
    assert.equal(percentileFor(category, mean), 50);
    assert.ok(percentileFor(category, mean + 10) > 50);
    assert.ok(percentileFor(category, mean - 10) < 50);
    assert.equal(percentileFor(category, 1000), 99);
    assert.equal(percentileFor(category, -1000), 1);
  });
});

test('results breakdown covers every category, answered or not', () => {
  const rows = categoryBreakdown([{ category: 'math', points: 100 }]);

  assert.deepEqual(
    rows.map((r) => r.category),
    RUN_CATEGORIES,
  );
  const math = rows.find((r) => r.category === 'math');
  assert.ok(math.answered && math.percentile > 90, `math percentile ${math.percentile}`);
  assert.equal(rows.find((r) => r.category === 'trivia').answered, false);
});
