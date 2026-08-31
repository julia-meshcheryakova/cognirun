import { ANSWER_WINDOW_SECONDS, scoreForAnswer, scoreForElapsed } from '../scoring.js';
import { beep } from '../beep.js';
import { cancelSpeech, speak } from '../tts.js';
import { escapeHtml } from '../format.js';
import { judgeAnswer } from '../judge.js';
import { STT_TIMEOUT_MS, sttMode, startListening } from '../stt.js';

/** After this the transcription counts as lost and the runner can retry or type. */
const TRANSCRIBE_BOUND_MS = STT_TIMEOUT_MS;

/**
 * Shows a question with a 60 second answer window measured on the run's
 * simulated clock, and reports the elapsed time and the points earned.
 *
 * Answering by voice: the mic opens automatically once the question has
 * finished being read aloud (starting it any earlier records the TTS audio
 * itself); the browser transcribes what was said and the transcript is graded
 * locally by `judgeAnswer` (normalized exact match).
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
  // Beep first as the milestone cue, then read the question over the screen text
  // and open the mic automatically — no tap required.
  const voiceTimer = setTimeout(async () => {
    // Read the question first, then auto-start listening once reading has
    // actually finished — starting the mic in parallel with speak() let it
    // record and transcribe the question's own TTS audio as the answer.
    if (mode === 'none') {
      setMicState('unavailable', 'Microphone unavailable — type your answer instead.');
      await speak(question.prompt);
      return;
    }
    setMicState('waiting', 'Reading the question…');
    await speak(question.prompt);
    if (submitted) return;
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
      <p class="prompt">${escapeHtml(question.prompt)}</p>
      ${input}
      <div class="voice">
        <div class="mic-status-row">
          <span class="mic-icon" id="mic-icon">🎤</span>
          <div class="waveform" id="waveform" hidden>
            ${Array.from({ length: 5 }, (_, i) => `<span class="bar bar-${i}"></span>`).join('')}
          </div>
        </div>
        <p class="interim" id="interim" hidden></p>
        <button class="primary stop-submit" id="stop-mic" hidden>■ Submit</button>
      </div>
      <textarea id="answer" rows="2" placeholder="Your answer..."></textarea>
      <div class="row">
        <span class="hint"><span id="countdown">0</span>s</span>
        <button class="primary" id="submit">Submit</button>
      </div>
    </div>
  `;

  const countdown = slot.querySelector('#countdown');
  const micIcon = slot.querySelector('#mic-icon');
  const waveform = slot.querySelector('#waveform');
  const interim = slot.querySelector('#interim');
  const stopMic = slot.querySelector('#stop-mic');
  let micState = 'waiting';
  let session = null;
  let submitted = false;
  // While a recording is being transcribed the deadline must not submit an empty
  // answer: the runner did speak in time, only the transcript is still on its way.
  let transcribing = false;

  const MIC_ICONS = { waiting: '🎤', opening: '🎤', recording: '🔴', transcribing: '…', unavailable: '🎤' };

  function setMicState(state) {
    micState = state;
    micIcon.textContent = MIC_ICONS[state] ?? '🎤';
    waveform.hidden = state !== 'recording';
    stopMic.hidden = state !== 'recording';
    if (state !== 'recording') interim.hidden = true;
  }

  // Opens the mic without a tap; permission denial falls back to typing, never dead-ends.
  async function autoStartMic() {
    if (submitted) return;
    setMicState('opening');
    try {
      const opened = await listen({
        mode,
        onInterim(text) {
          if (!text) return;
          interim.hidden = false;
          interim.textContent = `“${text}”`;
        },
      });
      if (submitted || micState !== 'opening') {
        opened.cancel();
        return;
      }
      session = opened;
      setMicState('recording');
    } catch (err) {
      console.warn('microphone unavailable', err);
      setMicState('unavailable');
    }
  }

  // Ticks up from zero (not a countdown): the runner has no fixed answer
  // budget to watch, just how long they have taken so far.
  const timer = setInterval(() => {
    const elapsed = (now() - startedAt) / 1000;
    countdown.textContent = Math.floor(elapsed);
    if (elapsed >= ANSWER_WINDOW_SECONDS && !transcribing) submit();
  }, 200);

  async function toggleMic() {
    if (micState !== 'recording') return;

    // Elapsed is taken here, before transcription latency, so speaking fast pays.
    const elapsedSeconds = (now() - startedAt) / 1000;
    transcribing = true;
    setMicState('transcribing');
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
      setMicState('unavailable');
      await autoStartMic();
      return;
    }
    if (!transcript) {
      transcribing = false;
      // No transcript from an auto-opened mic: retry listening once, keep typing open.
      setMicState('unavailable');
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
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        <p class="hint">${answerText ? escapeHtml(answerText) : '(no answer)'}</p>
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
        <span class="label">${verdict.correct ? '✅ Correct' : '❌ Wrong'}</span>
        <p class="prompt">${escapeHtml(question.prompt)}</p>
        <p class="hint">You said: ${answerText ? escapeHtml(answerText) : '(no answer)'}</p>
        <p class="answer"><strong>${escapeHtml(question.answer)}</strong></p>
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
  stopMic.addEventListener('click', toggleMic);
  slot.querySelector('#submit').addEventListener('click', () => submit());
  slot.querySelector('#answer')?.focus();
}
