import assert from 'node:assert/strict';
import test from 'node:test';

import { QUESTION_LIBRARY } from '../questions.js';
import {
  buildChallengeQuestionSet,
  challengeQuestionCount,
  challengeWeekIndex,
  difficultyCurve,
} from '../select.js';

test('challenge courses ask one question per km', () => {
  assert.equal(challengeQuestionCount('3k'), 3);
  assert.equal(challengeQuestionCount('5k'), 5);
  assert.equal(challengeQuestionCount('10k'), 10);
  assert.throws(() => challengeQuestionCount('300m'), /km course/);
});

test('the difficulty curve climbs from easy to hard', () => {
  assert.deepEqual(difficultyCurve(3), ['easy', 'medium', 'hard']);
  assert.deepEqual(difficultyCurve(5), ['easy', 'easy', 'medium', 'medium', 'hard']);
  assert.deepEqual(
    difficultyCurve(10).join(),
    'easy,easy,easy,easy,medium,medium,medium,hard,hard,hard',
  );
});

test('ISO weeks in challenge ids count up across year ends', () => {
  const w52 = challengeWeekIndex('2025-W52-5k');
  assert.equal(challengeWeekIndex('2026-W01-5k'), w52 + 1);
  assert.equal(challengeWeekIndex('2026-W02'), w52 + 2);
  assert.equal(challengeWeekIndex('2020-W53-3k') + 1, challengeWeekIndex('2021-W01-3k'));
  assert.equal(challengeWeekIndex('spring-special'), null);
  assert.equal(challengeWeekIndex('2026-W00'), null);
});

test('challenge sets are stable and differ by id and length', () => {
  const set = (challengeId, course) => buildChallengeQuestionSet({ challengeId, course });
  const ids = set('2026-W02-5k', '5k');
  assert.deepEqual(set('2026-W02-5k', '5k'), ids);
  assert.notDeepEqual(set('2026-W03-5k', '5k'), ids);
  assert.ok(ids.every((id) => QUESTION_LIBRARY.questions.some((q) => q.id === id)));

  const special = set('spring-special', '3k');
  assert.equal(special.length, 3);
  assert.equal(buildChallengeQuestionSet({ challengeId: 'x', course: '300m', count: 3 }).length, 3);
});
