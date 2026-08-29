import { ANSWER_WINDOW_SECONDS, scoreForAnswer, scoreForElapsed } from '../scoring.js';
import { beep } from '../beep.js';
import { cancelSpeech, speak } from '../tts.js';
import { escapeHtml } from '../format.js';
import { CATEGORY_LABELS } from '../questions.js';

/**
 * Shows a question with a 60 second answer window measured on the run's
 * simulated clock, and reports the elapsed time and the points earned.
 */
export function askQuestion(slot, { question, kilometer, now, onAnswered, onClosed }) {
  const startedAt = now();
  const category = CATEGORY_LABELS[question.category] ?? question.category;
  // Beep first as the milestone cue, then read the question over the screen text.
  const voiceTimer = setTimeout(() => speak(question.prompt), beep());

  const input = question.options
    ? `<div class="choices">
        ${question.options
          .map((option) => `<button class="choice" data-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`)
          .join('')}
      </div>`
    : `<textarea id="answer" rows="3" placeholder="Your answer..."></textarea>`;

  slot.innerHTML = `
    <div class="modal">
      <span class="label">Kilometer ${kilometer} · ${category}</span>
      <p class="prompt">${escapeHtml(question.prompt)}</p>
      ${input}
      <div class="row">
        <span class="hint"><span id="countdown">${ANSWER_WINDOW_SECONDS}</span>s left ·
          <span id="potential">100</span> pts if correct</span>
        <button class="primary" id="submit">Submit</button>
      </div>
    </div>
  `;

  const countdown = slot.querySelector('#countdown');
  const potential = slot.querySelector('#potential');
  let chosen = '';
  slot.querySelector('#answer')?.focus();

  const timer = setInterval(() => {
    const elapsed = (now() - startedAt) / 1000;
    countdown.textContent = Math.max(0, Math.ceil(ANSWER_WINDOW_SECONDS - elapsed));
    potential.textContent = scoreForElapsed(elapsed);
    if (elapsed >= ANSWER_WINDOW_SECONDS) submit();
  }, 200);

  function submit() {
    clearInterval(timer);
    clearTimeout(voiceTimer);
    cancelSpeech();
    const elapsedSeconds = (now() - startedAt) / 1000;
    const text = (slot.querySelector('#answer')?.value ?? chosen).trim();
    // Free-text answers are not graded; multiple choice is.
    const correct = question.options ? text === question.answer : null;
    const points = scoreForAnswer({ elapsedSeconds, correct });
    onAnswered({
      questionId: question.id,
      category: question.category,
      kilometer,
      elapsedSeconds,
      points,
      text,
      correct,
    });

    const verdict = correct === null ? '' : correct ? ' · correct' : ' · wrong';
    slot.innerHTML = `
      <div class="modal">
        <span class="label">Kilometer ${kilometer} · ${category} · ${points} points${verdict}</span>
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        <p class="hint">Your answer: ${text ? escapeHtml(text) : '(no answer)'}</p>
        <p class="answer"><strong>Answer:</strong> ${escapeHtml(question.answer)}</p>
        <button class="primary" id="continue">Keep running</button>
      </div>
    `;
    slot.querySelector('#continue').addEventListener('click', () => {
      slot.innerHTML = '';
      onClosed();
    });
  }

  slot.querySelectorAll('.choice').forEach((button) => {
    button.addEventListener('click', () => {
      chosen = button.dataset.option;
      submit();
    });
  });
  slot.querySelector('#submit').addEventListener('click', submit);
}
