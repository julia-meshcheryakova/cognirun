/**
 * Grades a (typically spoken and transcribed) answer. Normalized local matching runs
 * first and absorbs the noise speech recognition adds — casing, punctuation, filler
 * words — so "It's Tokyo!" grades the same as "Tokyo". Only when no local rule matches
 * does the server-side LLM judge (POST /api/judge) decide semantic equivalence; the
 * Groq key lives on the server, never in the bundle.
 */

import { JUDGE_URL } from './config.js';

/** A judge slower than this is treated as absent: the answer window keeps ticking. */
const JUDGE_TIMEOUT_MS = 6000;

/** Negates what follows it: "not Tokyo" is not an answer of "Tokyo". */
const NEGATOR = /^(not|no|nope|never|isnt|arent|wasnt|dont|doesnt|didnt|cant|wouldnt|except)$/;
/** Rejects what precedes it: "Tokyo is wrong". */
const REJECTION = /^(wrong|incorrect|false|opposite)$/;
/** Points back at the previous clause: "Tokyo, which is wrong". */
const REFERENT = /^(which|one|so|too|also)$/;
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
 * Splits a sentence into clauses graded on their own, so "Tokyo, not Kyoto" is judged
 * on "Tokyo". A clause that only rejects what came before ("..., which is wrong") stays
 * joined to it; one naming something else ("..., Kyoto is wrong") stands on its own.
 */
function clausesOf(text) {
  const parts = String(text ?? '').split(/[,;]|\bbut\b/i).map(normalizeAnswer);
  return parts
    .reduce((clauses, part) => {
      const words = part.split(' ');
      const refersBack = words.some((word) => REJECTION.test(word))
        && words.every((word) => REJECTION.test(word) || NEGATOR.test(word) || REFERENT.test(word));
      if (refersBack && clauses.length) clauses[clauses.length - 1] += ` ${part}`;
      else clauses.push(part);
      return clauses;
    }, [])
    .map((clause) => clause.trim())
    .filter(Boolean);
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
  const clauses = clausesOf(text);
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
        const rest = words.slice(i + target.length);
        // "Tokyo is not the answer": with the fillers gone the negator closes the
        // clause, so it has nothing but the match itself to negate.
        if (negatable && NEGATOR.test(rest[rest.length - 1] ?? '')) return false;
        const after = rest.slice(0, NEGATION_RANGE);
        // "not wrong" rejects nothing.
        return !after.some((word, j) => REJECTION.test(word) && !NEGATOR.test(after[j - 1] ?? ''));
      });
    });
  });
}

/**
 * Asks the server-side judge. Returns null when the server has no LLM configured
 * (503), so grading quietly stays local; throws on any other failure.
 */
async function askServer({ question, text, endpoint, fetchImpl, timeoutMs }) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ questionId: question.id, text }),
  });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error(`judge responded ${response.status}`);
  const verdict = await response.json();
  if (typeof verdict?.correct !== 'boolean') throw new Error('judge returned no verdict');
  return { correct: verdict.correct, reason: String(verdict.reason ?? '').slice(0, 120) };
}

const NO_MATCH = {
  correct: false,
  method: 'no-match',
  reason: 'Does not match the expected answer.',
};

/**
 * Grades an answer and reports which rule decided it, so the UI can explain the
 * verdict. `method` is `exact`, `contains`, `llm` or `no-match` (`empty` when nothing
 * was captured at all). Without a judge endpoint, for a question the server cannot
 * look up, or when the judge fails, only the local rules count.
 */
export async function judgeAnswer({
  question,
  text,
  endpoint = JUDGE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = JUDGE_TIMEOUT_MS,
}) {
  const answer = String(text ?? '').trim();
  if (!answer) return { correct: false, method: 'empty', reason: 'No answer captured.' };
  if (exactMatch(answer, question)) {
    return { correct: true, method: 'exact', reason: 'Matches the expected answer.' };
  }
  if (containsAnswer(answer, question)) {
    return { correct: true, method: 'contains', reason: 'Contains the expected answer.' };
  }
  if (!endpoint || !question.id) return { ...NO_MATCH };
  try {
    const verdict = await askServer({ question, text: answer, endpoint, fetchImpl, timeoutMs });
    return verdict ? { ...verdict, method: 'llm' } : { ...NO_MATCH };
  } catch (err) {
    console.warn('LLM judge unavailable, falling back to local matching', err);
    return {
      correct: false,
      method: 'no-match',
      reason: `Judge unavailable (${err.message}) — only local matches count.`,
    };
  }
}