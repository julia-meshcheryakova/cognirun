// Cloudflare Pages Function: POST /api/stt (raw audio body). Mirrors api/stt.mjs.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-audio-filename',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
  const key = env.ELEVENLABS_API_KEY || '';
  if (!key) return Response.json({ error: 'no key' }, { status: 503, headers: CORS });

  const audio = await request.arrayBuffer();
  if (audio.byteLength < 100) return Response.json({ error: 'no usable audio' }, { status: 400, headers: CORS });

  const ct = request.headers.get('content-type') || 'audio/webm';
  const fn = String(request.headers.get('x-audio-filename') || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
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
