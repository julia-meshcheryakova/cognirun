import { elevenLabsApiKey, elevenLabsVoiceId } from './keys.js';

const ELEVENLABS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel", a stock ElevenLabs voice
const MODEL_ID = 'eleven_turbo_v2_5';
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8 };

let enabled = true;
let playing = null;
let playingUrl = null;
let generation = 0;

function voiceId() {
  return elevenLabsVoiceId() || DEFAULT_VOICE_ID;
}

export function setVoiceEnabled(value) {
  enabled = value;
  if (!enabled) cancelSpeech();
}

/** Invalidates any in-flight or playing speech; see `generation` in `speak`. */
export function cancelSpeech() {
  generation += 1;
  playing?.pause?.();
  playing = null;
  if (playingUrl) URL.revokeObjectURL(playingUrl);
  playingUrl = null;
  globalThis.speechSynthesis?.cancel();
}

async function speakWithElevenLabs(text, key, mine) {
  const response = await fetch(`${ELEVENLABS_ENDPOINT}/${voiceId()}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!response.ok) throw new Error(`ElevenLabs responded ${response.status}`);

  const blob = await response.blob();
  if (!mine()) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  playing = audio;
  playingUrl = url;
  const release = () => {
    if (playingUrl !== url) return;
    URL.revokeObjectURL(url);
    playingUrl = null;
    playing = null;
  };
  audio.addEventListener('ended', release);
  try {
    await audio.play();
  } catch (err) {
    release();
    throw err;
  }
}

function speakWithBrowser(text) {
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return false;
  const utterance = new globalThis.SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  synth.speak(utterance);
  return true;
}

/**
 * Reads `text` aloud: ElevenLabs when a key is configured, otherwise (or when the
 * request fails) the browser's built-in SpeechSynthesis. Silent if neither works.
 */
export async function speak(text) {
  if (!enabled || !text) return;
  cancelSpeech();

  // A later cancel/speak bumps the generation, so this call stops being "current".
  const ours = generation;
  const mine = () => enabled && generation === ours;

  const key = elevenLabsApiKey();
  if (key) {
    try {
      await speakWithElevenLabs(text, key, mine);
      return;
    } catch (err) {
      console.warn('ElevenLabs TTS failed, using browser voice', err);
    }
  }
  if (mine()) speakWithBrowser(text);
}
