import { expect, test } from '@playwright/test';

import { weeklyChallenges } from '../web/src/challenges/schedule.js';
import { answerQuestions, stubSpeech } from './helpers.mjs';

test.beforeEach(({ page }) => stubSpeech(page));

test('a demo attempt at this week\'s 3K challenge is saved but not counted', async ({ page }) => {
  const [challenge3k] = weeklyChallenges(new Date());
  expect(challenge3k.course).toBe('3k');

  await page.goto('/');
  await page.locator('#demo-toggle').check();
  await page.locator('[data-mult="1000"]').click();

  await page.goto('/#/challenges');
  await expect(page.getByRole('heading', { name: 'Challenges', level: 1 })).toBeVisible();
  await expect(page.locator('.challenge-card')).toHaveCount(3);
  const card = page.locator(`.challenge-card[data-challenge-id="${challenge3k.id}"]`);
  await expect(card).toContainText('3 questions');
  await expect(card.locator('.challenge-best')).toHaveText('Not entered yet');

  await card.locator('[data-start-challenge]').click();
  await expect(page.locator('#tabs')).toBeHidden();

  await answerQuestions(page, 3);

  await expect(page.getByRole('heading', { name: 'Run complete' })).toBeVisible({ timeout: 30_000 });
  await page.locator('#restart').click();

  await expect(card.locator('.challenge-attempts')).toHaveText('1 demo attempt (not counted)');
  await expect(card.locator('.challenge-best')).toHaveText('Not entered yet');

  await page.goto('/#/history');
  await expect(page.locator('.run-item').first()).toContainText(`Challenge ${challenge3k.id}`);
});
