import { expect, test } from '@playwright/test';

import { QUESTION_LIBRARY } from '../question-server/questions.js';

// The run asks the first question of each category, in this order.
const RUN_QUESTIONS = ['trivia', 'logic', 'math'].map((category) =>
  QUESTION_LIBRARY.questions.find((q) => q.category === category),
);

test.beforeEach(async ({ page }) => {
  // Headless Chromium has no usable mic or voice: remove speech input so the
  // question falls back to typing, and make read-aloud finish instantly.
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.MediaRecorder;
    window.speechSynthesis = {
      speak: (utterance) => setTimeout(() => utterance.onend?.(), 0),
      cancel() {},
      getVoices: () => [],
    };
  });
});

test('a full demo run reaches the results page with every answer graded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CogniRun' })).toBeVisible();

  await page.locator('#demo-toggle').check();
  await page.locator('[data-mult="1000"]').click();
  await page.locator('#start').click();
  await expect(page.locator('#tabs')).toBeHidden();

  for (const question of RUN_QUESTIONS) {
    const prompt = page.locator('.modal .prompt', { hasText: question.prompt });
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    if (question.options) {
      await page.locator(`.choice[data-option="${question.answer}"]`).click();
    } else {
      await page.locator('#answer').fill(question.acceptedAnswers?.[0] ?? question.answer);
      await page.locator('#submit').click();
    }
    // The verdict popup is transient (the last one gives way to the results
    // page), so grading is asserted on the results table below.
  }

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
