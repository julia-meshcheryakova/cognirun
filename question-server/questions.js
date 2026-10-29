/**
 * Single source of truth for the CogniRun questions library (see
 * docs/QUESTIONS-SPEC.md). The questions come from the committed, generated
 * bank; edit bank/ or generate/ and run `npm --prefix question-server run generate`.
 */
import { BANK_QUESTIONS } from './bank/library.generated.js';
import { BANK_VERSION, CATEGORIES } from './bank/schema.js';

export const QUESTION_LIBRARY = {
  version: BANK_VERSION,
  categories: [...CATEGORIES],
  questions: BANK_QUESTIONS,
};
