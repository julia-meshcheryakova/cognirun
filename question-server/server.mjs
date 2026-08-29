import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

import { QUESTION_LIBRARY as library } from './questions.js';

const PORT = Number(process.env.PORT ?? 4000);

// ElevenLabs bridge: browser speechSynthesis/SpeechRecognition are silent in the
// Android WebView, so voice goes through these endpoints (fetch + MediaRecorder work).
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const ttsCache = new Map();

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleTts(req, res) {
  if (!ELEVENLABS_KEY) {
    res.writeHead(503, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ error: 'ElevenLabs is not configured.' }));
  }
  const raw = await readBody(req, 128 * 1024);
  let input;
  try {
    input = JSON.parse(raw.toString('utf8'));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ error: 'invalid JSON' }));
  }
  const text = String(input.text || '').trim().slice(0, 1500);
  if (!text) {
    res.writeHead(400, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ error: 'text is required' }));
  }
  const cacheKey = createHash('sha256').update(`${VOICE_ID}:${TTS_MODEL}:${text}`).digest('hex');
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    return res.end(cached);
  }
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: TTS_MODEL }),
    },
  );
  if (!upstream.ok) {
    res.writeHead(upstream.status, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    return res.end(await upstream.text());
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  if (ttsCache.size > 80) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(cacheKey, audio);
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  return res.end(audio);
}

async function handleStt(req, res) {
  if (!ELEVENLABS_KEY) {
    res.writeHead(503, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ error: 'ElevenLabs is not configured.' }));
  }
  const audio = await readBody(req);
  if (audio.length < 100) {
    res.writeHead(400, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ error: 'no usable audio' }));
  }
  const contentType = req.headers['content-type'] || 'audio/webm';
  const filename = String(req.headers['x-audio-filename'] || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), filename);
  form.append('model_id', STT_MODEL);
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');
  const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY },
    body: form,
  });
  const body = await upstream.text();
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') || 'application/json',
    'access-control-allow-origin': '*',
  });
  return res.end(body);
}

function payload(category) {
  if (!category) return library;
  return {
    ...library,
    categories: [category],
    questions: library.questions.filter((q) => q.category === category),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };

  // CORS preflight for the voice POST endpoints called from the WebView/browser.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-audio-filename',
    });
    return res.end();
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/tts') return await handleTts(req, res);
    if (req.method === 'POST' && url.pathname === '/api/stt') return await handleStt(req, res);
    if (url.pathname === '/api/config') return send(200, { elevenLabs: Boolean(ELEVENLABS_KEY) });
  } catch (error) {
    console.error(error);
    return send(500, { error: 'voice bridge error' });
  }

  if (url.pathname === '/health') return send(200, { ok: true, questions: library.questions.length });
  if (url.pathname !== '/questions') return send(404, { error: 'not found' });

  const category = url.searchParams.get('category');
  if (category && !library.categories.includes(category)) {
    return send(400, { error: `unknown category: ${category}` });
  }
  send(200, payload(category));
});

server.listen(PORT, () => {
  console.log(`question server on http://localhost:${PORT}/questions`);
});
