import { guard, clientIp, MAX_TTS_CHARS } from '../question-server/apiGuard.js';

const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const VOICE = () => process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const MODEL = () => process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';

export default async function handler(req, res) {
  const check = guard('tts', {
    method: req.method,
    origin: req.headers.origin,
    host: req.headers.host,
    ip: clientIp((name) => req.headers[name]),
    size: req.headers['content-length'],
    extraOrigins: process.env.ALLOWED_ORIGINS,
  });
  for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v);
  if (!check.ok) return check.body ? res.status(check.status).json(check.body) : res.status(check.status).end();
  if (!KEY()) return res.status(503).json({ error: 'no key' });

  const text = String(req.body?.text || '').trim().slice(0, MAX_TTS_CHARS);
  if (!text) return res.status(400).json({ error: 'text is required' });
  const up = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE())}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': KEY(), 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL() }),
    },
  );
  res.status(up.status);
  res.setHeader('content-type', 'audio/mpeg');
  res.send(Buffer.from(await up.arrayBuffer()));
}
