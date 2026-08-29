/**
 * Grades a (typically spoken and transcribed) answer entirely locally: no API key,
 * no external LLM. Normalized matching absorbs the noise speech recognition adds —
 * casing, punctuation, filler words — so "It's Tokyo!" grades the same as "Tokyo".
 */

/** Negates what follows it: "not Tokyo" is not an answer of "Tokyo". */
const NEGATOR = /^(not|no|nope|never|isnt|arent|wasnt|dont|doesnt|didnt|cant|wouldnt)$/;
/** Rejects what precedes it: "Tokyo is wrong". */
const REJECTION = /^(wrong|incorrect|false|opposite)$/;
/** How many words after a match are checked for a rejection. */
const NEGATION_RANGE = 2;

const FILLER = /\b(a|an|the|is|are|am|was|were|be|being|been|it|its|he|she|they|i|of|to|that|this|think|answer)\b/g;

/** Lowercase, drop punctuation and filler words so "It's Tokyo!" matches "Tokyo". */
export function normalizeAnswer(text) {
  return String(text ?? '')
    .toLowerCase()
    // Apostrophes go first so contractions collapse into single filler words.
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The normalized answer equals the expected one (or one of its accepted aliases). */
export function exactMatch(text, question) {
  const user = normalizeAnswer(text);
  if (!user) return false;
  const expected = [question.answer, ...(question.acceptedAnswers ?? [])].map(normalizeAnswer);
  return expected.includes(user);
}

/**
 * True when the expected answer is contained in a longer spoken sentence, so
 * "he is playing monopoly" grades as "monopoly". Only whole-word runs count, and
 * one-word expected answers still need to appear as their own word.
 *
 * A negation of the match itself does not count ("not Tokyo", "Tokyo is wrong"),
 * while a contrast with something else still does ("Tokyo, not Kyoto") and so does
 * a double negative ("Tokyo is not wrong").
 */
export function containsAnswer(text, question) {
  const expected = [question.answer, ...(question.acceptedAnswers ?? [])]
    .map(normalizeAnswer)
    .filter(Boolean);
  // Clauses are graded on their own, so "Tokyo, not Kyoto" is judged on "Tokyo".
  const clauses = String(text ?? '')
    .split(/[,;]|\bbut\b/i)
    .map(normalizeAnswer)
    .filter(Boolean);
  return clauses.some((clause) => {
    const words = clause.split(' ');
    return expected.some((answer) => {
      const target = answer.split(' ');
      // A negative answer ("it does not follow") carries its own negators, so one
      // ahead of the match cannot be told apart from part of the answer.
      const negatable = target.every((word) => !NEGATOR.test(word));
      return words.some((_, i) => {
        if (!target.every((word, j) => words[i + j] === word)) return false;
        if (negatable && words.slice(0, i).some((word) => NEGATOR.test(word))) return false;
        const after = words.slice(i + target.length, i + target.length + NEGATION_RANGE);
        // "not wrong" rejects nothing.
        return !after.some((word, j) => REJECTION.test(word) && !NEGATOR.test(after[j - 1] ?? ''));
      });
    });
  });
}

/**
 * Grades an answer and reports which local rule decided it, so the UI can explain
 * the verdict. `method` is `exact`, `contains` or `no-match` (`empty` when nothing
 * was captured at all).
 */
export async function judgeAnswer({ question, text }) {
  const answer = String(text ?? '').trim();
  if (!answer) return { correct: false, method: 'empty', reason: 'No answer captured.' };
  if (exactMatch(answer, question)) {
    return { correct: true, method: 'exact', reason: 'Matches the expected answer.' };
  }
  if (containsAnswer(answer, question)) {
    return { correct: true, method: 'contains', reason: 'Contains the expected answer.' };
  }
  return {
    correct: false,
    method: 'no-match',
    reason: 'Does not match the expected answer.',
  };
}
