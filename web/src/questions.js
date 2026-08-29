import { QUESTION_SERVER_URL } from './config.js';
// Bundled fallback: the same module the question server serves, so the app also
// works offline / in demo with no server running.
import { QUESTION_LIBRARY } from '../../question-server/questions.js';

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
    if (!library.questions?.length) throw new Error('question server returned an empty library');
    return { library, source: 'server' };
  } catch (err) {
    console.warn('using bundled questions:', err.message);
    return { library: QUESTION_LIBRARY, source: 'bundled' };
  }
}

/**
 * The single place run selection happens: the first question of each category,
 * in RUN_CATEGORIES order, so a run is reproducible. Swap the `[0]` for a random
 * pick to randomize.
 */
export function selectRunQuestions(library) {
  return RUN_CATEGORIES.map((category) => {
    const question = library.questions.find((q) => q.category === category);
    if (!question) throw new Error(`no questions for category ${category}`);
    return question;
  });
}
