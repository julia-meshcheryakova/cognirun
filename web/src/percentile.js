import { CATEGORY_LABELS, RUN_CATEGORIES } from './questions.js';

/**
 * Stub population baseline: the score an average runner earns on one question of
 * this category, as mean/sd of a normal distribution. Placeholder numbers until
 * we have real data — maths is assumed hardest to answer while running, trivia
 * easiest, so the same score lands in a higher percentile for maths.
 */
export const POPULATION = {
  trivia: { mean: 80, sd: 10 },
  logic: { mean: 72, sd: 12 },
  math: { mean: 66, sd: 14 },
};

/** Standard normal CDF (Abramowitz & Stegun 26.2.17 approximation). */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upperTail = (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? 1 - upperTail : upperTail;
}

/** Share of the population (1–99%) this score beats in the given category. */
export function percentileFor(category, score) {
  const { mean, sd } = POPULATION[category];
  const percentile = Math.round(normalCdf((score - mean) / sd) * 100);
  return Math.min(99, Math.max(1, percentile));
}

/** One row per run category: points scored and where that sits in the population. */
export function categoryBreakdown(answers) {
  return RUN_CATEGORIES.map((category) => {
    const scored = answers.filter((a) => a.category === category);
    const score = scored.reduce((sum, a) => sum + a.points, 0) / (scored.length || 1);
    const percentile = percentileFor(category, score);
    return {
      category,
      label: CATEGORY_LABELS[category],
      answered: scored.length > 0,
      score: Math.round(score),
      percentile,
      message: `you outperform ${percentile}% of the population`,
    };
  });
}
