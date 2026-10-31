// Cloudflare Pages Function: POST /api/judge. Mirrors api/judge.mjs.
import { judgeRequest, DEFAULT_MODEL } from '../../question-server/llmJudge.js';
import { guard, clientIp } from '../../question-server/apiGuard.js';

export async function onRequest({ request, env }) {
  const h = (name) => request.headers.get(name);
  const check = guard('judge', {
    method: request.method,
    origin: h('origin'),
    host: new URL(request.url).host,
    ip: clientIp(h),
    size: h('content-length'),
    extraOrigins: env.ALLOWED_ORIGINS,
  });
  const CORS = check.headers;
  if (!check.ok) return check.body ? Response.json(check.body, { status: check.status, headers: CORS }) : new Response(null, { status: check.status, headers: CORS });
  const input = await request.json().catch(() => ({}));
  // Pass the key explicitly: Workers have no process.env without nodejs_compat.
  const { status, body } = await judgeRequest(input, {
    key: env.GROQ_API_KEY || '',
    model: env.GROQ_MODEL || DEFAULT_MODEL,
  });
  return Response.json(body, { status, headers: CORS });
}
