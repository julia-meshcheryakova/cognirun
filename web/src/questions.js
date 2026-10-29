import { QUESTION_SERVER_URL } from './config.js';
// Bundled fallback: the same module the question server serves, so the app also
// works offline / in demo with no server running. The whole bank is bundled so
// every challenge's question ids resolve offline (docs/QUESTIONS-SPEC.md).
import { QUESTION_LIBRARY } from '../../question-server/questions.js';
import { selectQuestions } from '../../question-server/select.js';

export {
  ROTATION,
  buildChallengeQuestionSet,
  difficultyCurve,
  selectQuestions,
} from '../../question-server/select.js';

/** Asked in this order, one per kilometer of the 3 km run. */
export const RUN_CATEGORIES = ['trivia', 'logic', 'math'];

export const CATEGORY_LABELS = {
  trivia: 'Trivia',
  logic: 'Logic',
  math: 'Maths',
};

/** A question server that does not answer this fast is treated as absent. */
const LOAD_TIMEOUT_MS = 2000;

export async function loadLibrary({ url = QUESTION_SERVER_URL, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(`${url}/questions`, {
      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`question server returned ${response.status}`);
    const library = await response.json();
    const missing = RUN_CATEGORIES.filter(
      (category) => !library.questions?.some((q) => q.category === category),
    );
    if (missing.length) throw new Error(`question server is missing ${missing.join(', ')}`);
    return { library, source: 'server' };
  } catch (err) {
    console.warn('using bundled questions:', err.message);
    return { library: QUESTION_LIBRARY, source: 'bundled' };
  }
}

/**
 * The single place run selection happens: categories rotate in RUN_CATEGORIES
 * order (km1 trivia, km2 logic, km3 maths, km4 trivia, ...), taking the next
 * unused question of that category, so a run is reproducible. `count` is the
 * course's question count (3 for a 3K, 5 for a 5K, ...).
 */
export function selectRunQuestions(library, count = RUN_CATEGORIES.length) {
  const byCategory = Object.fromEntries(
    RUN_CATEGORIES.map((category) => [
      category,
      library.questions.filter((q) => q.category === category),
    ]),
  );
  return Array.from({ length: count }, (_, i) => {
    const category = RUN_CATEGORIES[i % RUN_CATEGORIES.length];
    const pool = byCategory[category];
    if (!pool.length) throw new Error(`no questions for category ${category}`);
    return pool[Math.floor(i / RUN_CATEGORIES.length) % pool.length];
  });
}

/** How many recently asked questions a solo run tries not to repeat. */
export const RECENT_QUESTION_LIMIT = 150;

/** Question ids of `runs` (newest first), most recent first, without duplicates. */
export function recentQuestionIds(runs = [], { limit = RECENT_QUESTION_LIMIT } = {}) {
  const ids = new Set();
  for (const run of runs) {
    for (const answer of run?.answers ?? []) {
      if (answer?.questionId) ids.add(answer.questionId);
      if (ids.size >= limit) return [...ids];
    }
  }
  return [...ids];
}

/**
 * A fresh solo run: random questions in category rotation that avoid what the
 * runner was asked in `recentRuns` (saved runs, newest first) while the bank
 * has unseen ones left. Pass `seed` to make it reproducible.
 */
export function selectSoloQuestions({
  library,
  count = RUN_CATEGORIES.length,
  recentRuns = [],
  seed = `solo|${Date.now()}|${Math.random()}`,
}) {
  return selectQuestions({ library, count, seed, exclude: recentQuestionIds(recentRuns) });
}
