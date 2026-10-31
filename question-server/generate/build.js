import { CORE_QUESTIONS } from '../bank/core.js';
import { TRIVIA_QUESTIONS } from '../bank/trivia.js';
import { DIFFICULTIES } from '../bank/schema.js';
import { LOGIC_TEMPLATES } from './logic.js';
import { MATH_TEMPLATES } from './math.js';
import { spokenNumberForms } from './numberWords.js';
import { generateFromTemplates } from './templates.js';

/** Changing the seed regenerates every templated question (and its id): don't. */
const BANK_SEED = 'cognirun-bank-v1';
/** Logic and maths are topped up to this many questions per difficulty. */
const PER_DIFFICULTY = 40;
/** What the committed bank must satisfy (checked by tests and the CLI). */
export const BANK_REQUIREMENTS = { minTotal: 300, minPerCell: 30 };

const GENERATED = [
  ['logic', LOGIC_TEMPLATES],
  ['math', MATH_TEMPLATES],
];

const KEY_ORDER = ['id', 'category', 'difficulty', 'prompt', 'answer', 'acceptedAnswers', 'options'];

/** Same key order for every question, so the generated file reads uniformly. */
function canonicalQuestion(question) {
  const ordered = {};
  for (const key of KEY_ORDER) if (question[key] !== undefined) ordered[key] = question[key];
  for (const [key, value] of Object.entries(question)) if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

/** Adds the spoken words of a whole-number answer ('56' -> 'fifty six') to acceptedAnswers. */
function enrichSpokenNumbers(question) {
  const forms = spokenNumberForms(question.answer);
  const existing = question.acceptedAnswers ?? [];
  const extra = forms.filter((f) => !existing.includes(f));
  if (!extra.length) return question;
  return { ...question, acceptedAnswers: [...existing, ...extra] };
}

/**
 * The whole bank, deterministically: core questions, curated trivia, then
 * templated logic and maths topping each difficulty up to `perDifficulty`.
 */
export function buildBank({ seed = BANK_SEED, perDifficulty = PER_DIFFICULTY } = {}) {
  const curated = [...CORE_QUESTIONS, ...TRIVIA_QUESTIONS];
  const prompts = new Set(curated.map((q) => q.prompt));
  const generated = [];
  for (const [category, templates] of GENERATED) {
    for (const difficulty of DIFFICULTIES) {
      const have = curated.filter((q) => q.category === category && q.difficulty === difficulty).length;
      const made = generateFromTemplates({
        category,
        templates,
        difficulty,
        count: perDifficulty - have,
        seed,
        avoid: prompts,
      });
      made.forEach((q) => prompts.add(q.prompt));
      generated.push(...made);
    }
  }
  return [...curated, ...generated].map((q) => canonicalQuestion(enrichSpokenNumbers(q)));
}
