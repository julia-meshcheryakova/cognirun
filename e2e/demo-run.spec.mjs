import { expect, test } from '@playwright/test';

import { answerQuestions, stubSpeech } from './helpers.mjs';

test.beforeEach(({ page }) => stubSpeech(page));

test('a full demo run reaches the results page with every answer graded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CogniRun' })).toBeVisible();

  await page.locator('#demo-toggle').check();
  await page.locator('[data-mult="1000"]').click();
  await page.locator('#start').click();
  await expect(page.locator('#tabs')).toBeHidden();

  const questions = await answerQuestions(page, 3);
  expect(questions.map((q) => q.category)).toEqual(['trivia', 'logic', 'math']);
  // The verdict popup is transient (the last one gives way to the results
  // page), so grading is asserted on the results table below.

  await expect(page.getByRole('heading', { name: 'Run complete' })).toBeVisible({
    timeout: 20_000,
  });
  const rows = page.locator('h2:text-is("Questions") + table.breakdown tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: '✅' })).toHaveCount(3);
  const total = Number(await page.locator('.metric.points strong').textContent());
  expect(total).toBeGreaterThanOrEqual(150);
  expect(total).toBeLessThanOrEqual(300);

  // The finished run is saved to the device and listed in History.
  await expect(page.locator('#tabs')).toBeVisible();
  await page.locator('#tabs [data-tab="history"]').click();
  await expect(page).toHaveURL(/#\/history$/);
  const saved = page.locator('.run-item');
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('3/3 correct');
  await expect(saved.locator('.run-points')).toHaveText(String(total));

  await page.locator('#tabs [data-tab="run"]').click();
  await expect(page.locator('#start')).toBeVisible();
  await page.reload();
  await page.locator('#tabs [data-tab="history"]').click();
  await expect(page.locator('.run-item')).toHaveCount(1);
});

test('the shipped bundle carries no API keys', async ({ page, request }) => {
  await page.goto('/');
  const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => e.src));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) {
    const body = await (await request.get(src)).text();
    expect(body).not.toMatch(/gsk_[A-Za-z0-9]{10}/);
    expect(body).not.toContain('api.groq.com');
    expect(body).not.toContain('xi-api-key');
  }
});
