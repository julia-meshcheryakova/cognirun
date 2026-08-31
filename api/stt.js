const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const MODEL = () => process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';

// Vercel's default body parser would mangle the raw audio bytes.
export const config = { api: { bodyParser: false } };

async function raw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, x-audio-filename');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY()) return res.status(503).json({ error: 'no key' });

  const audio = await raw(req);
  if (audio.length < 100) return res.status(400).json({ error: 'no usable audio' });

  const ct = req.headers['content-type'] || 'audio/webm';
  const fn = String(req.headers['x-audio-filename'] || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: ct }), fn);
  form.append('model_id', MODEL());
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');

  const up = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': KEY() },
    body: form,
  });
  const body = await up.text();
  res.status(up.status);
  res.setHeader('content-type', up.headers.get('content-type') || 'application/json');
  res.send(body);
}
