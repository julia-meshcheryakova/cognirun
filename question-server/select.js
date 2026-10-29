/**
 * Question selection shared by the web app and the server. Pure: the same
 * inputs always give the same questions, in Node and in the browser.
 * Contract: docs/QUESTIONS-SPEC.md ("Selection" and "Challenge mapping").
 */
import { CATEGORIES, DIFFICULTIES } from './bank/schema.js';
import { hashString } from './generate/rng.js';
import { QUESTION_LIBRARY } from './questions.js';

/** Category asked at km 1, 2, 3, then again from the start. */
export const ROTATION = [...CATEGORIES];

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const FIRST_MONDAY_MS = 4 * DAY_MS; // 1970-01-05

/**
 * `count` questions from `library`, slot i asking category ROTATION[i % 3],
 * never the same question twice. Within a category, questions are ordered by
 * a hash of (seed, id), so the set depends on the seed and the ids, not on
 * the bank's order. `exclude` (ids) is a soft filter: an excluded question is
 * only used when its category has nothing else left. `difficulties[i]`, if
 * given, is slot i's target difficulty; the closest available one wins.
 */
export function selectQuestions({ library, count, seed, exclude = [], difficulties = [] }) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`invalid question count ${count}`);
  const questions = library?.questions ?? [];
  const excluded = new Set(exclude);
  const rank = new Map(questions.map((q) => [q.id, hashString(`${seed}|${q.id}`)]));
  const used = new Set();
  const picks = [];
  for (let i = 0; i < count; i++) {
    const category = ROTATION[i % ROTATION.length];
    const tiers = [
      (q) => q.category === category && !excluded.has(q.id),
      (q) => q.category === category,
      (q) => !excluded.has(q.id),
      () => true,
    ];
    let pick;
    for (const tier of tiers) {
      pick = closest(questions.filter((q) => !used.has(q.id) && tier(q)), difficulties[i], rank);
      if (pick) break;
    }
    if (!pick) throw new Error(`library has fewer than ${count} questions`);
    used.add(pick.id);
    picks.push(pick);
  }
  return picks;
}

function closest(candidates, target, rank) {
  const want = DIFFICULTIES.indexOf(target);
  const distance = (q) => (want < 0 ? 0 : Math.abs(DIFFICULTIES.indexOf(q.difficulty) - want));
  let best;
  for (const q of candidates) {
    if (
      !best ||
      distance(q) < distance(best) ||
      (distance(q) === distance(best) && rank.get(q.id) < rank.get(best.id))
    ) {
      best = q;
    }
  }
  return best;
}

/** Easy first, hard last: 3 -> e,m,h; 5 -> e,e,m,m,h; 10 -> 4 easy, 3 medium, 3 hard. */
export function difficultyCurve(count) {
  return Array.from(
    { length: count },
    (_, i) => DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.floor((i * DIFFICULTIES.length) / count))],
  );
}

/** Questions per challenge course: one per km ('3k' -> 3, '10k' -> 10). */
export function challengeQuestionCount(course) {
  const match = /^(\d+)k$/.exec(String(course));
  if (!match || Number(match[1]) < 1) throw new Error(`not a km course: ${course}`);
  return Number(match[1]);
}

/**
 * Consecutive integer for the ISO week a challenge id starts with
 * ('2026-W02-5k'), or null when the id carries no week.
 */
export function challengeWeekIndex(challengeId) {
  const match = /^(\d{4})-W(\d{2})(?!\d)/.exec(String(challengeId));
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  return Math.round((week1Monday + (week - 1) * WEEK_MS - FIRST_MONDAY_MS) / WEEK_MS);
}

/**
 * The ordered question ids of a challenge (contract for weekly challenges):
 * deterministic from `challengeId` and `course`, one question per km, category
 * rotation trivia -> logic -> maths, easier early and harder late, no repeats.
 * Weekly ids ('YYYY-Www-...') alternate between two halves of the bank, so
 * consecutive weeks of the same length share no question. The ids depend on
 * the bank's contents: persist them when a challenge is published if they
 * must never change.
 */
export function buildChallengeQuestionSet({
  challengeId,
  course,
  library = QUESTION_LIBRARY,
  count = challengeQuestionCount(course),
}) {
  if (typeof challengeId !== 'string' || !challengeId.trim()) throw new Error('challengeId is required');
  const week = challengeWeekIndex(challengeId);
  const exclude =
    week === null
      ? []
      : library.questions.filter((q) => hashString(`week-half|${q.id}`) % 2 !== week % 2).map((q) => q.id);
  return selectQuestions({
    library,
    count,
    seed: `challenge|${challengeId}|${course}`,
    exclude,
    difficulties: difficultyCurve(count),
  }).map((q) => q.id);
}
