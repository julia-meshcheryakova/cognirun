const ELEVENLABS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel", a stock ElevenLabs voice
const MODEL_ID = 'eleven_turbo_v2_5';
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8 };

// Static access so Vite inlines these at build time.
const ENV_API_KEY = import.meta.env?.VITE_ELEVENLABS_API_KEY || '';
const ENV_VOICE_ID = import.meta.env?.VITE_ELEVENLABS_VOICE_ID || '';

let enabled = true;
let playing = null;

/**
 * The key is never hardcoded: it comes from the Vite env (`VITE_ELEVENLABS_API_KEY`
 * in `web/.env.local`) or from a runtime override, so the app can ship without one.
 */
function apiKey() {
  return (
    globalThis.COGNIRUN_ELEVENLABS_API_KEY ||
    globalThis.localStorage?.getItem('cognirun.elevenLabsApiKey') ||
    ENV_API_KEY
  );
}

function voiceId() {
  return ENV_VOICE_ID || DEFAULT_VOICE_ID;
}

export function setVoiceEnabled(value) {
  enabled = value;
  if (!enabled) cancelSpeech();
}

export function cancelSpeech() {
  playing?.pause?.();
  playing = null;
  globalThis.speechSynthesis?.cancel();
}

async function speakWithElevenLabs(text, key) {
  const response = await fetch(`${ELEVENLABS_ENDPOINT}/${voiceId()}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!response.ok) throw new Error(`ElevenLabs responded ${response.status}`);

  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  playing = audio;
  audio.addEventListener('ended', () => URL.revokeObjectURL(url));
  await audio.play();
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

  const key = apiKey();
  if (key) {
    try {
      await speakWithElevenLabs(text, key);
      return;
    } catch (err) {
      console.warn('ElevenLabs TTS failed, using browser voice', err);
    }
  }
  speakWithBrowser(text);
}
