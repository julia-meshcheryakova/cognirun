import { guard, clientIp, LIMITS } from '../question-server/apiGuard.js';

const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const MODEL = () => process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';

// Vercel's default body parser would mangle the raw audio bytes.
export const config = { api: { bodyParser: false } };

async function raw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const check = guard('stt', {
    method: req.method,
    origin: req.headers.origin,
    host: req.headers.host,
    ip: clientIp((name) => req.headers[name]),
    size: req.headers['content-length'],
    extraOrigins: process.env.ALLOWED_ORIGINS,
    allowHeaders: 'content-type, x-audio-filename',
  });
  for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v);
  if (!check.ok) return check.body ? res.status(check.status).json(check.body) : res.status(check.status).end();
  if (!KEY()) return res.status(503).json({ error: 'no key' });

  const audio = await raw(req, LIMITS.stt.maxBytes);
  if (!audio) return res.status(413).json({ error: 'request too large' });
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
