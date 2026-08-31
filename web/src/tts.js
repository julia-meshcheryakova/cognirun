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
  if (!synth || !globalThis.SpeechSynthesisUtterance) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    // Mic must not open until reading is done, so it never records its own TTS.
    utterance.onend = resolve;
    utterance.onerror = resolve;
    synth.speak(utterance);
  });
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
 * Reads `text` aloud. Always returns a promise that resolves once playback has
 * actually finished, so callers can safely wait before opening the mic (it used
 * to resolve immediately for the browser path, which raced the mic against the
 * TTS audio and let it transcribe its own question back as the answer).
 */
export function speak(text) {
  if (!enabled || !text) return Promise.resolve();
  cancelSpeech();
  if (!globalThis.fetch) {
    return speakBrowser(text);
  }
  return speakElevenLabs(text).catch(() => speakBrowser(text));
}
