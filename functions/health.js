// Cloudflare Pages Function: GET /health. Mirrors api/health.mjs.
import { QUESTION_LIBRARY as lib } from '../question-server/questions.js';

export function onRequest({ env }) {
  return Response.json(
    {
      ok: true,
      questions: lib.questions.length,
      eleven: Boolean(env.ELEVENLABS_API_KEY),
      groq: Boolean(env.GROQ_API_KEY),
    },
    { headers: { 'access-control-allow-origin': '*' } },
  );
}
