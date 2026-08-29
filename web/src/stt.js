const DEFAULT_LANG = 'en-US';

let active = null;

function recognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

/** True when the browser exposes the (prefixed or standard) SpeechRecognition API. */
export function isSpeechToTextSupported() {
  return Boolean(recognitionCtor());
}

function unsupportedResult() {
  return { supported: false, transcript: '', confidence: 0, reason: 'unsupported' };
}

/** Stops the current recognition session; its promise resolves with what was heard so far. */
export function cancelListening() {
  const current = active;
  active = null;
  current?.abort?.();
}

/**
 * Listens once and resolves with `{ supported, transcript, confidence, reason }`.
 * `onInterim` receives partial transcripts while the speaker is still talking.
 * Never rejects: unsupported browsers, denied microphones and recognition errors
 * all resolve with an empty transcript and a `reason`, so callers can fall back
 * to typing without special-casing.
 */
export function listenOnce({ lang = DEFAULT_LANG, onInterim } = {}) {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.resolve(unsupportedResult());

  cancelListening();

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = Boolean(onInterim);
  recognition.maxAlternatives = 1;
  active = recognition;

  return new Promise((resolve) => {
    let transcript = '';
    let confidence = 0;
    let reason = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (active === recognition) active = null;
      resolve({
        supported: true,
        transcript: transcript.trim(),
        confidence,
        reason: reason || (transcript.trim() ? null : 'no-speech'),
      });
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alternative = result[0];
        if (!alternative) continue;
        if (result.isFinal) {
          transcript += `${transcript ? ' ' : ''}${alternative.transcript}`;
          confidence = alternative.confidence ?? 0;
        } else {
          onInterim?.(alternative.transcript);
        }
      }
    };
    recognition.onerror = (event) => {
      reason = event?.error || 'error';
    };
    recognition.onend = finish;

    try {
      recognition.start();
    } catch (err) {
      reason = 'start-failed';
      finish();
    }
  });
}
