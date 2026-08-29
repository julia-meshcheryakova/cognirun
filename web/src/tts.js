/**
 * Reads questions aloud. Prefers ElevenLabs (fetch /api/tts -> play mp3) because the
 * browser's SpeechSynthesis is silent inside the Android WebView; falls back to
 * SpeechSynthesis when the server has no ElevenLabs key or the request fails.
 */

import { QUESTION_SERVER_URL } from './config.js';

let enabled = true;
let audio = null;

export function setVoiceEnabled(value) {
  enabled = value;
  if (!enabled) cancelSpeech();
}

/** Drops anything being spoken, so a new question is never read over an old one. */
export function cancelSpeech() {
  globalThis.speechSynthesis?.cancel();
  if (audio) {
    audio.pause?.();
    audio = null;
  }
}

function speakBrowser(text) {
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return;
  const utterance = new globalThis.SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  synth.speak(utterance);
}

async function speakElevenLabs(text) {
  const response = await fetch(`${QUESTION_SERVER_URL}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`tts ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    audio = new globalThis.Audio(url);
    audio.onended = resolve;
    audio.onerror = () => reject(new Error('audio playback failed'));
    audio.play().catch(reject);
  });
  URL.revokeObjectURL(url);
}

/**
 * Reads `text` aloud. Returns a promise, but callers may ignore it: the ElevenLabs
 * path is async while the browser path stays synchronous, matching the old API.
 */
export function speak(text) {
  if (!enabled || !text) return Promise.resolve();
  cancelSpeech();
  if (!globalThis.fetch) {
    speakBrowser(text);
    return Promise.resolve();
  }
  return speakElevenLabs(text).catch(() => speakBrowser(text));
}
