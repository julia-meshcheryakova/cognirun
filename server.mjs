import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.cwd(), 'www');
const port = Number(process.env.PORT || 4173);
const elevenLabsKey = process.env.ELEVENLABS_API_KEY || '';
const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const ttsModel = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const sttModel = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const roxfitUrl = process.env.ROXFIT_API_URL || '';
const roxfitToken = process.env.ROXFIT_API_TOKEN || '';
const ttsCache = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'cache-control': 'no-store', ...headers });
  response.end(body);
}

function json(response, status, value) {
  send(response, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' });
}

function readBody(request, limit = 25 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function handleTts(request, response) {
  if (!elevenLabsKey) return json(response, 503, { error: 'ElevenLabs is not configured on this server.' });
  const raw = await readBody(request, 128 * 1024);
  let input;
  try { input = JSON.parse(raw.toString('utf8')); } catch { return json(response, 400, { error: 'Invalid JSON.' }); }
  const text = String(input.text || '').trim().slice(0, 1500);
  if (!text) return json(response, 400, { error: 'Text is required.' });
  const key = createHash('sha256').update(`${voiceId}:${ttsModel}:${text}`).digest('hex');
  if (ttsCache.has(key)) return send(response, 200, ttsCache.get(key), { 'content-type': 'audio/mpeg', 'x-cognirun-cache': 'hit' });
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': elevenLabsKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: ttsModel,
      voice_settings: { stability: 0.55, similarity_boost: 0.72, style: 0, use_speaker_boost: true, speed: 1.02 },
    }),
  });
  if (!upstream.ok) return send(response, upstream.status, await upstream.text(), { 'content-type': 'text/plain; charset=utf-8' });
  const audio = Buffer.from(await upstream.arrayBuffer());
  if (ttsCache.size > 80) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(key, audio);
  return send(response, 200, audio, { 'content-type': 'audio/mpeg', 'x-cognirun-cache': 'miss' });
}

async function handleStt(request, response) {
  if (!elevenLabsKey) return json(response, 503, { error: 'ElevenLabs is not configured on this server.' });
  const audio = await readBody(request);
  if (audio.length < 100) return json(response, 400, { error: 'No usable audio was received.' });
  const contentType = request.headers['content-type'] || 'audio/webm';
  const filename = String(request.headers['x-audio-filename'] || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), filename);
  form.append('model_id', sttModel);
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');
  form.append('timestamps_granularity', 'word');
  const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': elevenLabsKey },
    body: form,
  });
  const body = await upstream.text();
  return send(response, upstream.status, body, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
}

async function handleRoxfitLive(response) {
  if (!roxfitUrl) return json(response, 503, { error: 'ROXFIT partner access is not configured.' });
  const headers = { accept: 'application/json' };
  if (roxfitToken) headers.authorization = `Bearer ${roxfitToken}`;
  const upstream = await fetch(roxfitUrl, { headers, signal: AbortSignal.timeout(3500) });
  const body = await upstream.text();
  return send(response, upstream.status, body, {
    'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
  });
}

async function serveStatic(pathname, response, method) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative || !extname(relative)) relative = relative || 'index.html';
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, '');
  let filename = resolve(join(root, safe));
  if (!filename.startsWith(root)) return send(response, 403, 'Forbidden');
  try {
    const info = await stat(filename);
    if (info.isDirectory()) filename = join(filename, 'index.html');
    const contents = await readFile(filename);
    response.writeHead(200, {
      'content-type': MIME[extname(filename).toLowerCase()] || 'application/octet-stream',
      'cache-control': extname(filename) === '.html' ? 'no-store' : 'public, max-age=60',
      'x-content-type-options': 'nosniff',
    });
    if (method === 'HEAD') response.end();
    else response.end(contents);
  } catch {
    send(response, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/api/config') {
      return json(response, 200, {
        elevenLabs: Boolean(elevenLabsKey),
        elevenLabsVoiceId: elevenLabsKey ? voiceId : null,
        roxfitPartnerEndpoint: Boolean(roxfitUrl),
        roxfitMode: roxfitUrl ? 'partner-configured' : 'sandbox',
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return json(response, 200, { ok: true, app: 'CogniRun', version: 1 });
    if (request.method === 'POST' && url.pathname === '/api/tts') return await handleTts(request, response);
    if (request.method === 'POST' && url.pathname === '/api/stt') return await handleStt(request, response);
    if (request.method === 'GET' && url.pathname === '/api/roxfit/live') return await handleRoxfitLive(response);
    if (request.method === 'GET' && url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Unknown API route.' });
    return await serveStatic(url.pathname, response, request.method);
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: 'CogniRun server error.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`CogniRun ready at http://localhost:${port}`);
  console.log(`ElevenLabs: ${elevenLabsKey ? 'configured' : 'browser fallback'} · ROXFIT: ${roxfitUrl ? 'partner endpoint configured' : 'sandbox adapter'}`);
});
