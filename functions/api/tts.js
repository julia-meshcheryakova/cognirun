// Cloudflare Pages Function: POST /api/tts. Mirrors api/tts.mjs.
import { guard, clientIp, MAX_TTS_CHARS } from '../../question-server/apiGuard.js';

export async function onRequest({ request, env }) {
  const h = (name) => request.headers.get(name);
  const check = guard('tts', {
    method: request.method,
    origin: h('origin'),
    host: new URL(request.url).host,
    ip: clientIp(h),
    size: h('content-length'),
    extraOrigins: env.ALLOWED_ORIGINS,
  });
  const CORS = check.headers;
  if (!check.ok) return check.body ? Response.json(check.body, { status: check.status, headers: CORS }) : new Response(null, { status: check.status, headers: CORS });
  const key = env.ELEVENLABS_API_KEY || '';
  if (!key) return Response.json({ error: 'no key' }, { status: 503, headers: CORS });

  const input = await request.json().catch(() => ({}));
  const text = String(input?.text || '').trim().slice(0, MAX_TTS_CHARS);
  if (!text) return Response.json({ error: 'text is required' }, { status: 400, headers: CORS });
  const voice = env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  const up = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5' }),
    },
  );
  return new Response(up.body, { status: up.status, headers: { ...CORS, 'content-type': 'audio/mpeg' } });
}
