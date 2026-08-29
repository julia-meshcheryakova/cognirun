/**
 * Speech-to-text for answering questions out loud. Browser-native only: the demo
 * needs no API keys and no external service — `SpeechRecognition` (or its webkit
 * prefixed form) does the transcribing, and typing stays available everywhere.
 */

/** How long we wait for the browser recogniser to flush its last result. */
const RECOGNITION_FLUSH_MS = 1500;
/** Bounds `stop()`, so a recogniser that never ends cannot freeze the question. */
export const STT_TIMEOUT_MS = 5000;

const deadline = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function recognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
}

/**
 * Which speech-to-text path is available:
 * - `browser`: the built-in Web Speech API (no key needed, Chromium only).
 * - `none`: no microphone input at all, the text box is the only way to answer.
 */
export function sttMode() {
  return recognitionCtor() ? 'browser' : 'none';
}

export function sttAvailable() {
  return sttMode() !== 'none';
}

function startRecognitionSession() {
  const Recognition = recognitionCtor();
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;

  let transcript = '';
  recognition.addEventListener('result', (event) => {
    transcript = Array.from(event.results ?? [])
      .map((result) => result[0]?.transcript ?? '')
      .join(' ');
  });
  // The recogniser can end on its own (silence, an error) before the runner taps
  // stop; calling `stop()` on it again throws and would lose what was heard.
  let ended = false;
  const settled = new Promise((resolve) => {
    const finish = () => {
      ended = true;
      resolve();
    };
    recognition.addEventListener('end', finish);
    recognition.addEventListener('error', finish);
  });
  recognition.start();

  return {
    mode: 'browser',
    async stop() {
      if (ended) return transcript.trim();
      try {
        recognition.stop();
      } catch (err) {
        console.warn('stopping speech recognition failed', err);
        return transcript.trim();
      }
      await Promise.race([settled, deadline(RECOGNITION_FLUSH_MS)]);
      return transcript.trim();
    },
    cancel() {
      try {
        recognition.abort?.();
      } catch (err) {
        console.warn('aborting speech recognition failed', err);
      }
    },
  };
}

/**
 * Opens the microphone and returns a session: `stop()` resolves with the
 * transcribed answer, `cancel()` drops the recording without transcribing.
 */
export async function startListening({ mode = sttMode() } = {}) {
  if (mode === 'browser') return startRecognitionSession();
  throw new Error('no speech input available');
}
