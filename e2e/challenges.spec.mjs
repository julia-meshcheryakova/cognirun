import { expect, test } from '@playwright/test';

import { QUESTION_LIBRARY } from '../question-server/questions.js';
import { weeklyChallenges } from '../web/src/challenges/schedule.js';

const BY_PROMPT = new Map(QUESTION_LIBRARY.questions.map((q) => [q.prompt, q]));

async function nextQuestion(page, asked) {
  const prompt = page.locator('.modal:has(#answer) .prompt');
  let question;
  await expect(async () => {
    question = BY_PROMPT.get((await prompt.textContent({ timeout: 1_000 }))?.trim());
    expect(question, 'the prompt shown is a bank question').toBeTruthy();
    expect(asked.has(question.id), `${question.id} was already answered`).toBe(false);
  }).toPass({ timeout: 20_000 });
  asked.add(question.id);
  return question;
}

test.beforeEach(async ({ page }) => {
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

  const asked = new Set();
  for (let i = 0; i < 3; i += 1) {
    const question = await nextQuestion(page, asked);
    if (question.options) {
      await page.locator(`.choice[data-option="${question.answer}"]`).click();
    } else {
      await page.locator('#answer').fill(question.acceptedAnswers?.[0] ?? question.answer);
      await page.locator('#submit').click();
    }
  }

  await expect(page.getByRole('heading', { name: 'Run complete' })).toBeVisible({ timeout: 30_000 });
  await page.locator('#restart').click();

  await expect(card.locator('.challenge-attempts')).toHaveText('1 demo attempt (not counted)');
  await expect(card.locator('.challenge-best')).toHaveText('Not entered yet');

  await page.goto('/#/history');
  await expect(page.locator('.run-item').first()).toContainText(`Challenge ${challenge3k.id}`);
});
