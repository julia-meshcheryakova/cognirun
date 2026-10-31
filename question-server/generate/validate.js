import { CATEGORIES, DIFFICULTIES } from '../bank/schema.js';

/** An answer the runner can say in one breath. */
const SHORT_ANSWER = { maxWords: 3, maxChars: 24 };
const MAX_PROMPT_CHARS = 160;

const words = (text) => String(text).trim().split(/\s+/).length;
const isShort = (text) => words(text) <= SHORT_ANSWER.maxWords && String(text).length <= SHORT_ANSWER.maxChars;
const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

/** Problems with one question; [] when it is valid. */
export function validateQuestion(q) {
  const errors = [];
  const id = q?.id ?? '(no id)';
  const fail = (message) => errors.push(`${id}: ${message}`);
  if (!nonEmpty(q?.id) || !/^[a-z]+-[a-z0-9-]+$/.test(q.id)) fail('id must be <category>-<slug>');
  if (!CATEGORIES.includes(q?.category)) fail(`unknown category ${q?.category}`);
  else if (!q.id?.startsWith(`${q.category}-`)) fail('id must start with its category');
  if (!DIFFICULTIES.includes(q?.difficulty)) fail(`unknown difficulty ${q?.difficulty}`);
  if (!nonEmpty(q?.prompt)) fail('prompt is required');
  else if (q.prompt.length > MAX_PROMPT_CHARS) fail(`prompt longer than ${MAX_PROMPT_CHARS} chars`);
  if (!nonEmpty(q?.answer)) fail('answer is required');
  if (q?.acceptedAnswers !== undefined) {
    if (!Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.every(nonEmpty)) {
      fail('acceptedAnswers must be non-empty strings');
    }
  }
  if (nonEmpty(q?.answer)) {
    const spoken = [q.answer, ...(Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [])];
    if (!spoken.some(isShort)) fail('needs a short spoken answer (answer or acceptedAnswers)');
  }
  if (q?.options !== undefined) {
    const options = q.options;
    if (!Array.isArray(options) || options.length < 2 || options.length > 5 || !options.every(nonEmpty)) {
      fail('options must be 2-5 non-empty strings');
    } else {
      if (new Set(options).size !== options.length) fail('options must be distinct');
      if (!options.includes(q.answer)) fail('options must include the answer');
      // Options are matched by attribute selectors and read aloud.
      if (options.some((o) => o.includes('"'))) fail('options must not contain double quotes');
      if (nonEmpty(q.answer) && !isShort(q.answer)) fail('multiple-choice answer must be short');
    }
  }
  return errors;
}

/**
 * Problems with a whole bank; [] when it is valid. `minPerCell` is the least
 * number of questions each category x difficulty must have.
 */
export function validateBank(questions, { minTotal = 0, minPerCell = 0 } = {}) {
  const errors = questions.flatMap(validateQuestion);
  const seenIds = new Set();
  const seenPrompts = new Set();
  for (const q of questions) {
    if (seenIds.has(q.id)) errors.push(`${q.id}: duplicate id`);
    seenIds.add(q.id);
    const prompt = String(q.prompt).trim().toLowerCase();
    if (seenPrompts.has(prompt)) errors.push(`${q.id}: duplicate prompt`);
    seenPrompts.add(prompt);
  }
  if (questions.length < minTotal) errors.push(`bank has ${questions.length} questions, needs ${minTotal}`);
  for (const category of CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      const n = questions.filter((q) => q.category === category && q.difficulty === difficulty).length;
      if (n < minPerCell) errors.push(`${category}/${difficulty} has ${n} questions, needs ${minPerCell}`);
    }
  }
  return errors;
}

/** Counts per category and difficulty, for reports and docs. */
export function bankStats(questions) {
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const inCategory = questions.filter((q) => q.category === category);
      return [
        category,
        {
          total: inCategory.length,
          ...Object.fromEntries(
            DIFFICULTIES.map((d) => [d, inCategory.filter((q) => q.difficulty === d).length]),
          ),
        },
      ];
    }),
  );
}
