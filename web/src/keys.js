/**
 * Single place API keys are read from. Keys are never hardcoded: they come from the
 * Vite env (`web/.env.local`, inlined at build time) or from a runtime override
 * (`globalThis.COGNIRUN_*` / localStorage), so the app can ship without any of them.
 */

// Static access so Vite inlines this at build time.
const ENV_GROQ = import.meta.env?.VITE_GROQ_API_KEY || '';

export function groqApiKey() {
  const override = globalThis.COGNIRUN_GROQ_API_KEY;
  if (override) return override;
  try {
    return globalThis.localStorage?.getItem('cognirun.groqApiKey') || ENV_GROQ;
  } catch (err) {
    // localStorage throws when site data is blocked.
    return ENV_GROQ;
  }
}
