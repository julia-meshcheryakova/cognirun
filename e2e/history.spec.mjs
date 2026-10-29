import { expect, test } from '@playwright/test';

// Thursday of ISO week 2026-W44: the seeded runs below fall in W42, W43 and W44.
const NOW = new Date('2026-10-29T12:00:00Z');
const RUNS_KEY = 'cognirun.runs.v1';

function answer(km, category, correct, points) {
  return {
    questionId: `${category}-${km}`,
    category,
    km,
    elapsedS: 5 + km,
    text: correct ? 'right' : 'wrong',
    correctAnswer: 'right',
    correct,
    points,
    method: 'exact',
  };
}

function record(id, finishedAt, { answers, course = '3k', distanceM = 3000, durationS = 1200, ...rest }) {
  return {
    id,
    schema: 1,
    startedAt: new Date(Date.parse(finishedAt) - durationS * 1000).toISOString(),
    finishedAt,
    mode: rest.challengeId ? 'challenge' : 'solo',
    challengeId: null,
    course,
    demo: false,
    distanceM,
    durationS,
    avgSpeed: distanceM / durationS,
    points: answers.reduce((sum, a) => sum + a.points, 0),
    correct: answers.filter((a) => a.correct).length,
    total: answers.length,
    hrAvg: null,
    hrMax: null,
    answers,
    route: Array.from({ length: 20 }, (_, i) => ({
      lat: 52.37 + i * 0.0004,
      lng: 4.89 + Math.sin(i / 3) * 0.0006,
      t: (i * durationS) / 19,
      distance: (i * distanceM) / 19,
      speed: distanceM / durationS + Math.sin(i) * 0.3,
      heartRate: 0,
    })),
    synced: false,
    ...rest,
  };
}

const RUNS = [
  record('r-demo', '2026-10-28T08:00:00.000Z', {
    demo: true,
    durationS: 60,
    answers: [answer(1, 'trivia', true, 100), answer(2, 'logic', true, 100), answer(3, 'math', true, 90)],
  }),
  record('r-5k', '2026-10-27T08:00:00.000Z', {
    course: '5k',
    distanceM: 5000,
    durationS: 1800,
    challengeId: '2026-W44-5k',
    answers: [
      answer(1, 'trivia', true, 90),
      answer(2, 'logic', true, 80),
      answer(3, 'math', false, 0),
      answer(4, 'trivia', true, 85),
      answer(5, 'logic', true, 75),
    ],
  }),
  record('r-best', '2026-10-21T08:00:00.000Z', {
    durationS: 1080,
    answers: [answer(1, 'trivia', true, 90), answer(2, 'logic', true, 80), answer(3, 'math', true, 70)],
  }),
  record('r-old', '2026-10-13T08:00:00.000Z', {
    answers: [answer(1, 'trivia', true, 80), answer(2, 'logic', false, 0), answer(3, 'math', false, 0)],
  }),
];

async function seed(page, runs) {
  await page.clock.setFixedTime(NOW);
  // Seed once: a reload must keep what the test deleted.
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: RUNS_KEY, value: JSON.stringify(runs) },
  );
}

const total = (page, key) => page.locator(`.totals [data-total="${key}"] strong`);

test('history shows progress over real runs and filters the run list', async ({ page }) => {
  await seed(page, RUNS);
  await page.goto('/#/history');

  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(total(page, 'runs')).toHaveText('3');
  await expect(total(page, 'points')).toHaveText(String(80 + 240 + 330));
  await expect(total(page, 'distance')).toHaveText('11.00');
  await expect(page.locator('.streak')).toHaveAttribute('data-current', '3');
  await expect(page.locator('.pb-table tr[data-course="3k"] td').nth(1)).toHaveText('240');
  await expect(page.locator('.pb-table tr[data-course="3k"] td').nth(2)).toHaveText('18:00');
  await expect(page.locator('.category-bars li')).toHaveCount(3);
  await expect(page.locator('.category-bars li[data-category="trivia"] .cat-value')).toHaveText('100%');
  await expect(page.locator('#trend-points')).toBeVisible();
  await expect(page.locator('#trend-pace')).toBeVisible();

  const items = page.locator('.run-item');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText('3/3 correct');
  await expect(items.locator('.badge.demo')).toHaveCount(1);
  await expect(page.locator('.run-item[data-run-id="r-5k"] .badge.challenge')).toHaveText(
    'Challenge 2026-W44-5k',
  );
  await expect(page.locator('.run-item[data-run-id="r-best"] .run-points')).toHaveText('240');

  await page.locator('#show-demo').uncheck();
  await expect(items).toHaveCount(3);
  await expect(items.locator('.badge.demo')).toHaveCount(0);

  await page.locator('.history-filters [data-course="5k"]').click();
  await expect(items).toHaveCount(1);
  await expect(total(page, 'runs')).toHaveText('1');
  await expect(page.locator('.pb-table tr[data-course="3k"]')).toHaveCount(0);

  await page.locator('.history-filters [data-course=""]').click();
  await page.locator('#show-demo').check();
  await expect(items).toHaveCount(4);
  await expect(total(page, 'runs')).toHaveText('3');
});

test('a run opens in detail, and can be deleted after confirming', async ({ page }) => {
  await seed(page, RUNS);
  await page.goto('/#/history');

  await page.locator('.run-item[data-run-id="r-best"]').click();
  await expect(page).toHaveURL(/#\/history\/r-best$/);
  await expect(page.getByRole('heading', { name: '3K run' })).toBeVisible();
  await expect(page.locator('.metric.points strong')).toHaveText('240');
  const rows = page.locator('h2:text-is("Questions") + table.breakdown tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: '✅' })).toHaveCount(3);
  await expect(page.locator('.pb-badges.held')).toContainText('3K PB');
  await expect(page.locator('#route')).toBeVisible();

  await page.locator('.back-link').first().click();
  await expect(page).toHaveURL(/#\/history$/);

  await page.locator('.run-item[data-run-id="r-old"]').click();
  await expect(page).toHaveURL(/#\/history\/r-old$/);
  await expect(page.locator('h2:text-is("Questions") + table.breakdown tbody tr').filter({ hasText: '❌' })).toHaveCount(2);

  await page.locator('#delete-run').click();
  await expect(page.locator('#delete-confirm')).toBeVisible();
  await page.locator('#cancel-delete').click();
  await expect(page.locator('#delete-confirm')).toBeHidden();
  await expect(page).toHaveURL(/#\/history\/r-old$/);

  await page.locator('#delete-run').click();
  await page.locator('#confirm-delete').click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.locator('.run-item')).toHaveCount(3);
  await expect(page.locator('.run-item[data-run-id="r-old"]')).toHaveCount(0);
  await expect(total(page, 'runs')).toHaveText('2');

  await page.reload();
  await expect(page.locator('.run-item')).toHaveCount(3);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).map((r) => r.id), RUNS_KEY);
  expect(stored).toEqual(['r-demo', 'r-5k', 'r-best']);

  await page.goto('/#/history/r-old');
  await expect(page.getByRole('heading', { name: 'Run not found' })).toBeVisible();
});

test('history has an empty state, and demo-only history explains progress', async ({ page }) => {
  await page.goto('/#/history');
  await expect(page.getByText('No runs yet')).toBeVisible();
  await expect(page.locator('.run-item')).toHaveCount(0);

  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: RUNS_KEY, value: JSON.stringify([RUNS[0]]) },
  );
  await page.reload();
  await expect(page.locator('.run-item')).toHaveCount(1);
  await expect(page.getByText('Only demo runs so far')).toBeVisible();
});
