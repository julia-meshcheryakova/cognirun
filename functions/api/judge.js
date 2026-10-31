// Cloudflare Pages Function: POST /api/judge. Mirrors api/judge.mjs.
import { judgeRequest, DEFAULT_MODEL } from '../../question-server/llmJudge.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
  const input = await request.json().catch(() => ({}));
  // Pass the key explicitly: Workers have no process.env without nodejs_compat.
  const { status, body } = await judgeRequest(input, {
    key: env.GROQ_API_KEY || '',
    model: env.GROQ_MODEL || DEFAULT_MODEL,
  });
  return Response.json(body, { status, headers: CORS });
}
