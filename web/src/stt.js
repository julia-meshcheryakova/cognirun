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

/** Both listener styles of the Web Speech API are in the wild; support either. */
function on(recognition, type, handler) {
  if (typeof recognition.addEventListener === 'function') recognition.addEventListener(type, handler);
  else recognition[`on${type}`] = handler;
}

/**
 * Collects what the recogniser heard. `event.results` is cumulative, so only the
 * segments from `resultIndex` on are new; the confidence reported is the one of
 * the last final segment.
 */
function transcriptCollector() {
  let transcript = '';
  let confidence = 0;
  return {
    collect(event) {
      Array.from(event.results ?? [])
        .slice(event.resultIndex ?? 0)
        .forEach((result) => {
          const alternative = result[0];
          if (!alternative || result.isFinal === false) return;
          transcript += `${transcript ? ' ' : ''}${alternative.transcript ?? ''}`;
          confidence = alternative.confidence ?? 0;
        });
    },
    get transcript() {
      return transcript.trim();
    },
    get confidence() {
      return confidence;
    },
  };
}

function startRecognitionSession() {
  const Recognition = recognitionCtor();
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;

  const heard = transcriptCollector();
  on(recognition, 'result', (event) => heard.collect(event));
  // The recogniser can end on its own (silence, an error) before the runner taps
  // stop; calling `stop()` on it again throws and would lose what was heard.
  let ended = false;
  let error = null;
  const settled = new Promise((resolve) => {
    const finish = (event) => {
      error ??= event?.error ?? null;
      ended = true;
      resolve();
    };
    on(recognition, 'end', finish);
    on(recognition, 'error', finish);
  });

  return {
    mode: 'browser',
    recognition,
    heard,
    settled,
    get ended() {
      return ended;
    },
    get error() {
      return error;
    },
    async drain() {
      if (ended) return heard.transcript;
      try {
        recognition.stop();
      } catch (err) {
        console.warn('stopping speech recognition failed', err);
        return heard.transcript;
      }
      await Promise.race([settled, deadline(RECOGNITION_FLUSH_MS)]);
      return heard.transcript;
    },
    abort() {
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
  if (mode !== 'browser') throw new Error('no speech input available');
  const session = startRecognitionSession();
  session.recognition.start();
  return {
    mode: session.mode,
    stop: () => session.drain(),
    cancel: () => session.abort(),
  };
}

let listening = null;

/** Drops the recogniser opened by `listenOnce`, if one is still running. */
export function cancelListening() {
  listening?.abort();
  listening = null;
}

/**
 * Listens until the recogniser stops on its own (silence ends a Web Speech
 * session) and reports what was heard. `reason` explains an empty transcript:
 * `unsupported`, `start-failed`, `no-speech`, or the recogniser's own error.
 */
export async function listenOnce() {
  if (!recognitionCtor()) {
    return { supported: false, transcript: '', confidence: 0, reason: 'unsupported' };
  }
  cancelListening();
  const session = startRecognitionSession();
  listening = session;
  try {
    session.recognition.start();
  } catch (err) {
    console.warn('starting speech recognition failed', err);
    if (listening === session) listening = null;
    return { supported: true, transcript: '', confidence: 0, reason: 'start-failed' };
  }

  await session.settled;
  if (listening === session) listening = null;
  return {
    supported: true,
    transcript: session.heard.transcript,
    confidence: session.heard.confidence,
    reason: session.heard.transcript ? null : session.error ?? 'no-speech',
  };
}
