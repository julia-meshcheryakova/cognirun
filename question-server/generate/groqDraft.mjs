/**
 * Optional, never used by tests or the build: asks Groq for draft questions and
 * writes them to bank/review/ (git-ignored) for a human to vet. Approved drafts
 * are copied by hand into bank/trivia.js (or turned into a template), then
 * `npm --prefix question-server run generate` rebuilds the bank.
 *
 * The key comes from GROQ_API_KEY in the environment only; never commit it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BANK_QUESTIONS } from '../bank/library.generated.js';
import { CATEGORIES } from '../bank/schema.js';
import { DEFAULT_MODEL, GROQ_ENDPOINT } from '../llmJudge.js';
import { shortHash } from './rng.js';
import { validateQuestion } from './validate.js';

const REVIEW_DIR = fileURLToPath(new URL('../bank/review/', import.meta.url));

const SYSTEM_PROMPT = [
  'You write quiz questions that are read aloud to someone who is running.',
  'Each question has one short, undisputed answer of at most three words that is easy to say aloud,',
  'and three plausible but clearly wrong options. Avoid accents, quotes, trick questions and facts that change over time.',
  'Reply with JSON only: {"questions": [{"prompt": "...", "answer": "...", "options": ["...", "...", "...", "..."],',
  '"difficulty": "easy|medium|hard"}]}. The options include the answer.',
].join(' ');

export async function draftWithGroq({
  count = 10,
  category = 'trivia',
  key = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!key) throw new Error('set GROQ_API_KEY in the environment to draft questions');
  if (!CATEGORIES.includes(category)) throw new Error(`unknown category ${category}`);

  const response = await fetchImpl(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Write ${count} new ${category} questions, mixed difficulty.` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq responded ${response.status}`);
  const content = (await response.json()).choices?.[0]?.message?.content ?? '{}';
  const drafts = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}').questions ?? [];

  const known = new Set(BANK_QUESTIONS.map((q) => q.prompt.trim().toLowerCase()));
  const review = drafts.map((draft) => {
    const question = {
      id: `${category}-draft-${shortHash(String(draft.prompt))}`,
      category,
      difficulty: draft.difficulty,
      prompt: draft.prompt,
      answer: draft.answer,
      options: draft.options,
    };
    const problems = validateQuestion(question);
    if (known.has(String(draft.prompt).trim().toLowerCase())) problems.push('already in the bank');
    return { approved: false, problems, question };
  });

  mkdirSync(REVIEW_DIR, { recursive: true });
  const file = `${REVIEW_DIR}${category}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, `${JSON.stringify({ model, category, review }, null, 2)}\n`);
  return file;
}
