// Cloudflare Pages Function: POST /api/stt (raw audio body). Mirrors api/stt.mjs.
import { guard, clientIp, LIMITS } from '../../question-server/apiGuard.js';

export async function onRequest({ request, env }) {
  const h = (name) => request.headers.get(name);
  const check = guard('stt', {
    method: request.method,
    origin: h('origin'),
    host: new URL(request.url).host,
    ip: clientIp(h),
    size: h('content-length'),
    extraOrigins: env.ALLOWED_ORIGINS,
    allowHeaders: 'content-type, x-audio-filename',
  });
  const CORS = check.headers;
  if (!check.ok) return check.body ? Response.json(check.body, { status: check.status, headers: CORS }) : new Response(null, { status: check.status, headers: CORS });
  const key = env.ELEVENLABS_API_KEY || '';
  if (!key) return Response.json({ error: 'no key' }, { status: 503, headers: CORS });

  const audio = await request.arrayBuffer();
  if (audio.byteLength > LIMITS.stt.maxBytes) return Response.json({ error: 'request too large' }, { status: 413, headers: CORS });
  if (audio.byteLength < 100) return Response.json({ error: 'no usable audio' }, { status: 400, headers: CORS });

  const ct = h('content-type') || 'audio/webm';
  const fn = String(h('x-audio-filename') || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: ct }), fn);
  form.append('model_id', env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');

  const up = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  return new Response(await up.text(), {
    status: up.status,
    headers: { ...CORS, 'content-type': up.headers.get('content-type') || 'application/json' },
  });
}
