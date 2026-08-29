/**
 * Grades a (typically spoken and transcribed) answer entirely locally: no API key,
 * no external LLM. Normalized matching absorbs the noise speech recognition adds —
 * casing, punctuation, filler words — so "It's Tokyo!" grades the same as "Tokyo".
 */

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
 */
export function containsAnswer(text, question) {
  const user = normalizeAnswer(text);
  if (!user) return false;
  const expected = [question.answer, ...(question.acceptedAnswers ?? [])]
    .map(normalizeAnswer)
    .filter(Boolean);
  const words = user.split(' ');
  return expected.some((answer) => {
    const target = answer.split(' ');
    return words.some((_, i) => target.every((word, j) => words[i + j] === word));
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
