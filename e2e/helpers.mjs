import { expect } from '@playwright/test';

import { QUESTION_LIBRARY } from '../question-server/questions.js';

// Runs pick random questions, so specs read the prompt on screen and look its
// answer up in the bank (prompts are unique, the bank validator checks it).
const BY_PROMPT = new Map(QUESTION_LIBRARY.questions.map((q) => [q.prompt, q]));

/**
 * Headless Chromium has no usable mic or voice: remove speech input so a
 * question falls back to typing, and make read-aloud finish instantly.
 */
export async function stubSpeech(page) {
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
}

/**
 * Answer the run's next `count` questions correctly, waiting for each one that
 * is open for an answer (not a verdict still on screen). Returns the questions.
 */
export async function answerQuestions(page, count) {
  const prompt = page.locator('.modal:has(#answer) .prompt');
  const asked = [];
  for (let i = 0; i < count; i += 1) {
    let question;
    await expect(async () => {
      question = BY_PROMPT.get((await prompt.textContent({ timeout: 1_000 }))?.trim());
      expect(question, 'the prompt shown is a bank question').toBeTruthy();
      expect(asked.includes(question), `${question.id} was already answered`).toBe(false);
    }).toPass({ timeout: 20_000 });
    asked.push(question);
    if (question.options) {
      await page.locator(`.choice[data-option="${question.answer}"]`).click();
    } else {
      await page.locator('#answer').fill(question.acceptedAnswers?.[0] ?? question.answer);
      await page.locator('#submit').click();
    }
  }
  return asked;
}
