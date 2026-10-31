// Cloudflare Pages Function: POST /api/tts. Mirrors api/tts.mjs.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
  const key = env.ELEVENLABS_API_KEY || '';
  if (!key) return Response.json({ error: 'no key' }, { status: 503, headers: CORS });

  const { text = '' } = await request.json().catch(() => ({}));
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
