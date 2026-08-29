/**
 * Reads questions aloud with the browser's built-in SpeechSynthesis: no API key and
 * no external service. Silent when the browser has no speech synthesis.
 */

let enabled = true;

export function setVoiceEnabled(value) {
  enabled = value;
  if (!enabled) cancelSpeech();
}

/** Drops anything being spoken, so a new question is never read over an old one. */
export function cancelSpeech() {
  globalThis.speechSynthesis?.cancel();
}

export function speak(text) {
  if (!enabled || !text) return;
  cancelSpeech();
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return;
  const utterance = new globalThis.SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  synth.speak(utterance);
}
