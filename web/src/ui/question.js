import { ANSWER_WINDOW_SECONDS, scoreForAnswer, scoreForElapsed } from '../scoring.js';
import { beep } from '../beep.js';
import { cancelSpeech, speak } from '../tts.js';
import { escapeHtml } from '../format.js';
import { CATEGORY_LABELS } from '../questions.js';
import { judgeAnswer } from '../judge.js';
import { STT_TIMEOUT_MS, sttMode, startListening } from '../stt.js';

/** After this the transcription counts as lost and the runner can retry or type. */
const TRANSCRIBE_BOUND_MS = STT_TIMEOUT_MS;

const MIC_LABELS = {
  waiting: '🎤 Mic opens as the question is read',
  opening: '🎤 Opening the mic…',
  recording: '🔴 Listening… ■ stop &amp; submit',
  transcribing: '… Transcribing',
  unavailable: '🎤 Microphone unavailable — type instead',
};

/**
 * Shows a question with a 60 second answer window measured on the run's
 * simulated clock, and reports the elapsed time and the points earned.
 *
 * Answering by voice: the mic becomes available the moment the question starts
 * being read aloud; the browser transcribes what was said and the transcript is
 * graded locally by `judgeAnswer` (normalized exact match).
 */
export function askQuestion(
  slot,
  {
    question,
    kilometer,
    now,
    onAnswered,
    onClosed,
    judge = judgeAnswer,
    listen = startListening,
    mode = sttMode(),
  },
) {
  const startedAt = now();
  const category = CATEGORY_LABELS[question.category] ?? question.category;
  // Beep first as the milestone cue, then read the question over the screen text
  // and open the mic automatically — no tap required.
  const voiceTimer = setTimeout(async () => {
    // Read the question, then auto-start listening the moment reading begins.
    speak(question.prompt);
    if (mode === 'none') {
      setMicState('unavailable', 'Microphone unavailable — type your answer instead.');
      return;
    }
    await autoStartMic();
  }, beep());

  const input = question.options
    ? `<div class="choices">
        ${question.options
          .map((option) => `<button class="choice" data-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`)
          .join('')}
      </div>`
    : '';

  slot.innerHTML = `
    <div class="modal">
      <span class="label">Kilometer ${kilometer} · ${category}</span>
      <p class="prompt">${escapeHtml(question.prompt)}</p>
      ${input}
      <div class="voice">
        <button class="mic" id="mic" disabled>${MIC_LABELS.waiting}</button>
        <span class="hint" id="mic-status">Listening starts automatically — or type below.</span>
      </div>
      <textarea id="answer" rows="2" placeholder="Your answer..."></textarea>
      <div class="row">
        <span class="hint"><span id="countdown">${ANSWER_WINDOW_SECONDS}</span>s left ·
          <span id="potential">100</span> pts if correct</span>
        <button class="primary" id="submit">Submit</button>
      </div>
    </div>
  `;

  const countdown = slot.querySelector('#countdown');
  const potential = slot.querySelector('#potential');
  const mic = slot.querySelector('#mic');
  const micStatus = slot.querySelector('#mic-status');
  let micState = 'waiting';
  let session = null;
  let submitted = false;
  // While a recording is being transcribed the deadline must not submit an empty
  // answer: the runner did speak in time, only the transcript is still on its way.
  let transcribing = false;

  function setMicState(state, status) {
    micState = state;
    if (!mic) return;
    mic.innerHTML = MIC_LABELS[state] ?? MIC_LABELS.waiting;
    // Only the recording state is tappable now (to stop & submit early).
    mic.disabled = state !== 'recording';
    mic.classList.toggle('recording', state === 'recording');
    if (status) micStatus.textContent = status;
  }

  // Opens the mic without a tap; permission denial falls back to typing, never dead-ends.
  async function autoStartMic() {
    if (submitted) return;
    setMicState('opening', 'Opening the microphone…');
    try {
      const opened = await listen({ mode });
      if (submitted || micState !== 'opening') {
        opened.cancel();
        return;
      }
      session = opened;
      setMicState('recording', 'Listening… tap to stop & submit early.');
    } catch (err) {
      console.warn('microphone unavailable', err);
      setMicState('unavailable', 'Microphone blocked — type your answer instead.');
    }
  }

  const timer = setInterval(() => {
    const elapsed = (now() - startedAt) / 1000;
    countdown.textContent = Math.max(0, Math.ceil(ANSWER_WINDOW_SECONDS - elapsed));
    potential.textContent = scoreForElapsed(elapsed);
    if (elapsed >= ANSWER_WINDOW_SECONDS && !transcribing) submit();
  }, 200);

  async function toggleMic() {
    if (micState !== 'recording') return;

    // Elapsed is taken here, before transcription latency, so speaking fast pays.
    const elapsedSeconds = (now() - startedAt) / 1000;
    transcribing = true;
    setMicState('transcribing', 'Transcribing your answer…');
    const active = session;
    session = null;
    let transcript = '';
    try {
      transcript = await Promise.race([
        active.stop(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('transcription timed out')), TRANSCRIBE_BOUND_MS),
        ),
      ]);
    } catch (err) {
      console.warn('transcription failed', err);
      active.cancel();
      transcribing = false;
      setMicState('unavailable', 'Could not transcribe that — type your answer, or retry the mic.');
      await autoStartMic();
      return;
    }
    if (!transcript) {
      transcribing = false;
      // No transcript from an auto-opened mic: retry listening once, keep typing open.
      setMicState('unavailable', 'Nothing was heard — type your answer, or retry the mic.');
      await autoStartMic();
      return;
    }
    submit({ text: transcript, elapsedSeconds, spoken: true });
  }

  async function submit({ text, elapsedSeconds, spoken = false } = {}) {
    if (submitted) return;
    submitted = true;
    clearInterval(timer);
    clearTimeout(voiceTimer);
    cancelSpeech();
    session?.cancel();
    session = null;
    transcribing = false;

    const elapsed = elapsedSeconds ?? (now() - startedAt) / 1000;
    const answerText = (text ?? slot.querySelector('#answer')?.value ?? '').trim();

    slot.innerHTML = `
      <div class="modal">
        <span class="label">Kilometer ${kilometer} · ${category}</span>
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        <p class="hint">Your answer: ${answerText ? escapeHtml(answerText) : '(no answer)'}</p>
        <p class="hint">Checking your answer…</p>
      </div>
    `;

    const verdict = await judge({ question, text: answerText });
    // Correct answers earn the time-decay points, wrong ones nothing.
    const points = verdict.correct ? scoreForElapsed(elapsed) : 0;

    onAnswered({
      questionId: question.id,
      category: question.category,
      kilometer,
      elapsedSeconds: elapsed,
      points,
      text: answerText,
      spoken,
      correct: verdict.correct,
      verdict,
    });

    slot.innerHTML = `
      <div class="modal">
        <span class="label">Kilometer ${kilometer} · ${category} · ${points} points ·
          ${verdict.correct ? 'correct' : 'wrong'}</span>
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        <p class="hint">${spoken ? 'You said' : 'Your answer'}: ${
          answerText ? escapeHtml(answerText) : '(no answer)'
        }</p>
        <p class="answer"><strong>Answer:</strong> ${escapeHtml(question.answer)}</p>
        <p class="hint">Judged by ${escapeHtml(verdict.method)}${
          verdict.reason ? ` · ${escapeHtml(verdict.reason)}` : ''
        }</p>
        <button class="primary" id="continue">Keep running</button>
      </div>
    `;
    slot.querySelector('#continue').addEventListener('click', () => {
      slot.innerHTML = '';
      onClosed();
    });
  }

  slot.querySelectorAll('.choice').forEach((button) => {
    button.addEventListener('click', () => submit({ text: button.dataset.option }));
  });
  mic.addEventListener('click', toggleMic);
  slot.querySelector('#submit').addEventListener('click', () => submit());
  slot.querySelector('#answer')?.focus();
}
