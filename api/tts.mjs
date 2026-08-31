const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const VOICE = () => process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const MODEL = () => process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!KEY()) return res.status(503).json({ error: 'no key' });

  const text = (req.body?.text) || '';
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
