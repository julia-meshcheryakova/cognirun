import { createRng, shortHash } from './rng.js';

/**
 * Turns seeded templates into questions. A template is
 *   { key, difficulty, make(rng) -> { prompt, answer, options?, acceptedAnswers? } }
 * and gets its own RNG stream (seed + category + key), so adding a template never
 * reshuffles the others. Templates of the requested difficulty take turns until
 * `count` distinct prompts exist. Ids are `<category>-<key>-<hash(prompt)>`, so a
 * question keeps its id for as long as its prompt is unchanged.
 */
export function generateFromTemplates({ category, templates, difficulty, count, seed, avoid = new Set() }) {
  const active = templates
    .filter((t) => t.difficulty === difficulty)
    .map((t) => ({ ...t, rng: createRng(`${seed}:${category}:${t.key}`) }));
  if (!active.length || count <= 0) return [];
  const seen = new Set(avoid);
  const out = [];
  const maxAttempts = count * 200;
  for (let attempt = 0; out.length < count && attempt < maxAttempts; attempt++) {
    const template = active[attempt % active.length];
    const made = template.make(template.rng);
    if (!made || seen.has(made.prompt)) continue;
    seen.add(made.prompt);
    out.push({
      id: `${category}-${template.key}-${shortHash(made.prompt)}`,
      category,
      difficulty,
      prompt: made.prompt,
      answer: String(made.answer),
      ...(made.acceptedAnswers?.length ? { acceptedAnswers: made.acceptedAnswers } : {}),
      ...(made.options ? { options: made.options.map(String) } : {}),
    });
  }
  if (out.length < count) {
    throw new Error(`${category}/${difficulty}: only ${out.length} of ${count} unique questions`);
  }
  return out;
}

/**
 * Four numeric options: the answer plus three plausible mistakes (first the
 * template's own, then near misses), positive, distinct, sorted ascending.
 */
export function numericOptions(rng, answer, mistakes = []) {
  const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10];
  const pool = [...mistakes, ...rng.shuffle(near)];
  const options = [answer];
  for (const value of pool) {
    if (options.length === 4) break;
    if (Number.isInteger(value) && value > 0 && !options.includes(value)) options.push(value);
  }
  for (let extra = 3; options.length < 4; extra++) {
    if (!options.includes(answer + extra)) options.push(answer + extra);
  }
  return options.sort((a, b) => a - b).map(String);
}
