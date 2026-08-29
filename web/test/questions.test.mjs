import assert from 'node:assert/strict';
import test from 'node:test';

import { QUESTION_LIBRARY } from '../../question-server/questions.js';
import { RUN_CATEGORIES, loadLibrary, selectRunQuestions } from '../src/questions.js';
import { POPULATION, categoryBreakdown, percentileFor } from '../src/percentile.js';

test('library holds 10 self-contained questions per category', () => {
  assert.deepEqual(QUESTION_LIBRARY.categories, RUN_CATEGORIES);

  RUN_CATEGORIES.forEach((category) => {
    const questions = QUESTION_LIBRARY.questions.filter((q) => q.category === category);
    assert.equal(questions.length, 10, `${category} has ${questions.length} questions`);
    questions.forEach((q) => {
      assert.ok(q.prompt && q.answer, `${q.id} needs a prompt and an answer`);
      assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), `${q.id} difficulty`);
      if (q.options) assert.ok(q.options.includes(q.answer), `${q.id} options miss the answer`);
    });
  });

  const ids = QUESTION_LIBRARY.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'question ids must be unique');
});

test('a run asks one question per category, deterministically', () => {
  const selected = selectRunQuestions(QUESTION_LIBRARY);

  assert.deepEqual(
    selected.map((q) => q.category),
    RUN_CATEGORIES,
  );
  assert.deepEqual(selectRunQuestions(QUESTION_LIBRARY), selected, 'selection must be reproducible');
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
  assert.equal(down.library.questions.length, 30);
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
