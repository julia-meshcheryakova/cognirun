import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CORE_QUESTIONS } from '../bank/core.js';
import { BANK_QUESTIONS } from '../bank/library.generated.js';
import { BANK_FILE, renderBankModule } from '../generate/cli.mjs';
import { BANK_REQUIREMENTS, buildBank } from '../generate/build.js';
import { LOGIC_TEMPLATES } from '../generate/logic.js';
import { MATH_TEMPLATES } from '../generate/math.js';
import { numberToWords, spokenNumberForms, yearToWords } from '../generate/numberWords.js';
import { generateFromTemplates } from '../generate/templates.js';
import { bankStats, validateBank, validateQuestion } from '../generate/validate.js';
import { QUESTION_LIBRARY } from '../questions.js';

test('the committed bank is valid, big enough and balanced', () => {
  assert.deepEqual(validateBank(BANK_QUESTIONS, BANK_REQUIREMENTS), []);
  assert.ok(BANK_QUESTIONS.length >= 300);
  const stats = bankStats(BANK_QUESTIONS);
  for (const [category, row] of Object.entries(stats)) {
    assert.ok(row.total >= 100, `${category} has ${row.total}`);
  }
  assert.equal(QUESTION_LIBRARY.questions, BANK_QUESTIONS);
  assert.equal(QUESTION_LIBRARY.version, 2);
});

test('the committed bank is up to date with bank/ and generate/', () => {
  const committed = readFileSync(BANK_FILE, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(
    committed,
    renderBankModule(buildBank()),
    'run `npm --prefix question-server run generate` and commit the result',
  );
});

test('the original 30 questions keep their ids and content', () => {
  const byId = new Map(BANK_QUESTIONS.map((q) => [q.id, q]));
  assert.equal(CORE_QUESTIONS.length, 30);
  for (const core of CORE_QUESTIONS) {
    const q = byId.get(core.id);
    assert.ok(q, `${core.id} is missing`);
    for (const key of ['category', 'difficulty', 'prompt', 'answer', 'options']) {
      assert.deepEqual(q[key], core[key], `${core.id}.${key} changed`);
    }
  }
});

test('the validator catches broken questions', () => {
  const good = { id: 'math-x', category: 'math', difficulty: 'easy', prompt: 'One plus one?', answer: '2' };
  assert.deepEqual(validateQuestion(good), []);

  const problems = (patch) => validateQuestion({ ...good, ...patch }).join('\n');
  assert.match(problems({ id: 'logic-x' }), /start with its category/);
  assert.match(problems({ difficulty: 'tricky' }), /difficulty/);
  assert.match(problems({ prompt: '' }), /prompt/);
  assert.match(problems({ answer: 'a very long answer nobody says' }), /short spoken answer/);
  assert.deepEqual(validateQuestion({ ...good, answer: 'a very long answer nobody says', acceptedAnswers: ['2'] }), []);
  assert.match(problems({ options: ['1', '3'] }), /include the answer/);
  assert.match(problems({ options: ['2', '2'] }), /distinct/);
  assert.match(problems({ options: ['2', 'say "3"'] }), /double quotes/);
  assert.match(problems({ acceptedAnswers: [''] }), /acceptedAnswers/);

  const dupes = validateBank([good, { ...good }, { ...good, id: 'math-y' }]).join('\n');
  assert.match(dupes, /duplicate id/);
  assert.match(dupes, /duplicate prompt/);
  assert.match(validateBank([good], { minTotal: 2, minPerCell: 1 }).join('\n'), /needs 2[\s\S]*trivia\/easy/);
});

test('generators are deterministic per seed and give correct, unique questions', () => {
  for (const [category, templates] of [
    ['logic', LOGIC_TEMPLATES],
    ['math', MATH_TEMPLATES],
  ]) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const make = (seed) => generateFromTemplates({ category, templates, difficulty, count: 30, seed });
      const a = make('test-seed');
      assert.deepEqual(make('test-seed'), a, `${category}/${difficulty} is not deterministic`);
      assert.notDeepEqual(make('other-seed'), a);
      assert.deepEqual(validateBank(a), []);
      a.forEach((q) => {
        assert.equal(q.category, category);
        assert.equal(q.difficulty, difficulty);
        assert.ok(q.id.startsWith(`${category}-`));
      });
    }
  }
});

test('generated maths answers are right', () => {
  const math = BANK_QUESTIONS.filter((q) => q.category === 'math' && !/^math-\d+$/.test(q.id));
  const checks = [
    [/^What is (\d+) plus (\d+)\?$/, (a, b) => a + b],
    [/^What is (\d+) minus (\d+)\?$/, (a, b) => a - b],
    [/^What is (\d+) times (\d+)\?$/, (a, b) => a * b],
    [/^What is (\d+) divided by (\d+)\?$/, (a, b) => a / b],
    [/^What is (\d+) percent of (\d+)\?$/, (a, b) => (a * b) / 100],
    [/^What is half of (\d+)\?$/, (a) => a / 2],
    [/^What is (\d+) squared\?$/, (a) => a * a],
    [/^How many seconds are in (\d+) minutes\?$/, (a) => a * 60],
    [/^You run (\d+) km in (\d+) minutes\. What is your pace in minutes per km\?$/, (km, min) => min / km],
    [/^At (\d+) minutes per km, how many minutes does a (\d+) km run take\?$/, (pace, km) => pace * km],
  ];
  let checked = 0;
  for (const q of math) {
    for (const [pattern, solve] of checks) {
      const match = pattern.exec(q.prompt);
      if (!match) continue;
      assert.equal(Number(q.answer), solve(...match.slice(1).map(Number)), `${q.id}: ${q.prompt}`);
      checked++;
    }
  }
  assert.ok(checked > 40, `only ${checked} maths questions were checked`);
});

test('whole-number answers can be said in words', () => {
  assert.equal(numberToWords(0), 'zero');
  assert.equal(numberToWords(56), 'fifty six');
  assert.equal(numberToWords(206), 'two hundred six');
  assert.equal(numberToWords(3500), 'three thousand five hundred');
  assert.equal(yearToWords(1969), 'nineteen sixty nine');
  assert.equal(yearToWords(1905), 'nineteen oh five');
  assert.deepEqual(spokenNumberForms('156'), ['one hundred fifty six', 'one hundred and fifty six']);
  assert.deepEqual(spokenNumberForms('Third'), []);

  const twelve = BANK_QUESTIONS.find((q) => q.answer === '12');
  assert.ok(twelve.acceptedAnswers.includes('twelve'));
});
