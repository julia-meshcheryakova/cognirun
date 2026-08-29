import { ANSWER_WINDOW_SECONDS, scoreForElapsed } from '../scoring.js';
import { beep } from '../beep.js';
import { escapeHtml } from '../format.js';

/**
 * Shows a question with a 60 second answer window measured on the run's
 * simulated clock, and reports the elapsed time and the points earned.
 */
export function askQuestion(slot, { question, kilometer, now, onAnswered, onClosed }) {
  const startedAt = now();
  beep();

  slot.innerHTML = `
    <div class="modal">
      <span class="label">Kilometer ${kilometer}</span>
      <p class="prompt">${question.prompt}</p>
      <textarea id="answer" rows="3" placeholder="Your answer..."></textarea>
      <div class="row">
        <span class="hint"><span id="countdown">${ANSWER_WINDOW_SECONDS}</span>s left ·
          <span id="potential">100</span> pts</span>
        <button class="primary" id="submit">Submit</button>
      </div>
    </div>
  `;

  const countdown = slot.querySelector('#countdown');
  const potential = slot.querySelector('#potential');
  slot.querySelector('#answer').focus();

  const timer = setInterval(() => {
    const elapsed = (now() - startedAt) / 1000;
    countdown.textContent = Math.max(0, Math.ceil(ANSWER_WINDOW_SECONDS - elapsed));
    potential.textContent = scoreForElapsed(elapsed);
    if (elapsed >= ANSWER_WINDOW_SECONDS) submit();
  }, 200);

  function submit() {
    clearInterval(timer);
    const elapsedSeconds = (now() - startedAt) / 1000;
    const points = scoreForElapsed(elapsedSeconds);
    const text = slot.querySelector('#answer').value.trim();
    onAnswered({ questionId: question.id, kilometer, elapsedSeconds, points, text });

    slot.innerHTML = `
      <div class="modal">
        <span class="label">Kilometer ${kilometer} · ${points} points</span>
        <p class="prompt">${question.prompt}</p>
        <p class="hint">Your answer: ${text ? escapeHtml(text) : '(no answer)'}</p>
        <p class="answer"><strong>Answer:</strong> ${question.answer}</p>
        <button class="primary" id="continue">Keep running</button>
      </div>
    `;
    slot.querySelector('#continue').addEventListener('click', () => {
      slot.innerHTML = '';
      onClosed();
    });
  }

  slot.querySelector('#submit').addEventListener('click', submit);
}
