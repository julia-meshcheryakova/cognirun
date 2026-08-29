/**
 * Single place API keys are read from. Keys are never hardcoded: they come from the
 * Vite env (`web/.env.local`, inlined at build time) or from a runtime override
 * (`globalThis.COGNIRUN_*` / localStorage), so the app can ship without any of them.
 */

// Static access so Vite inlines these at build time.
const ENV = {
  elevenLabs: import.meta.env?.VITE_ELEVENLABS_API_KEY || '',
  elevenLabsVoice: import.meta.env?.VITE_ELEVENLABS_VOICE_ID || '',
  groq: import.meta.env?.VITE_GROQ_API_KEY || '',
};

function readKey(globalName, storageKey, envValue) {
  const override = globalThis[globalName];
  if (override) return override;
  try {
    return globalThis.localStorage?.getItem(storageKey) || envValue;
  } catch (err) {
    // localStorage throws when site data is blocked.
    return envValue;
  }
}

export function elevenLabsApiKey() {
  return readKey('COGNIRUN_ELEVENLABS_API_KEY', 'cognirun.elevenLabsApiKey', ENV.elevenLabs);
}

export function elevenLabsVoiceId() {
  return ENV.elevenLabsVoice;
}

export function groqApiKey() {
  return readKey('COGNIRUN_GROQ_API_KEY', 'cognirun.groqApiKey', ENV.groq);
}
