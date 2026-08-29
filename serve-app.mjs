import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { QUESTION_LIBRARY as lib } from './question-server/questions.js';

const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const web = resolve('web/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-audio-filename', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

async function raw(req) { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); }
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') return json(res, 200, { ok: true, questions: lib.questions.length, eleven: Boolean(KEY) });
  if (url.pathname === '/api/config') return json(res, 200, { elevenLabs: Boolean(KEY) });
  if (url.pathname === '/questions') {
    const cat = url.searchParams.get('category');
    const out = cat ? { ...lib, questions: lib.questions.filter((q) => q.category === cat) } : lib;
    return json(res, 200, out);
  }
  if (req.method === 'POST' && url.pathname === '/api/tts') {
    if (!KEY) return json(res, 503, { error: 'no key' });
    const b = JSON.parse((await raw(req)).toString() || '{}');
    const up = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text: b.text || '', model_id: TTS_MODEL }) });
    res.writeHead(up.status, { 'content-type': 'audio/mpeg', ...CORS });
    return res.end(Buffer.from(await up.arrayBuffer()));
  }
  if (req.method === 'POST' && url.pathname === '/api/stt') {
    if (!KEY) return json(res, 503, { error: 'no key' });
    const audio = await raw(req);
    if (audio.length < 100) return json(res, 400, { error: 'no usable audio' });
    const ct = req.headers['content-type'] || 'audio/webm';
    const fn = String(req.headers['x-audio-filename'] || 'answer.webm').replace(/[^a-z0-9._-]/gi, '');
    const form = new FormData();
    form.append('file', new Blob([audio], { type: ct }), fn);
    form.append('model_id', STT_MODEL);
    form.append('language_code', 'en');
    form.append('tag_audio_events', 'false');
    const up = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': KEY }, body: form });
    const body = await up.text();
    res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json', ...CORS });
    return res.end(body);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let f = join(web, p);
  try { const s = await stat(f); if (s.isDirectory()) f = join(f, 'index.html'); } catch { f = join(web, 'index.html'); }
  try { const data = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', ...CORS }); res.end(data); }
  catch { res.writeHead(404); res.end('not found'); }
});
const PORT = process.env.PORT || 4173;
server.listen(PORT, '0.0.0.0', () => console.log(`CogniRun on http://0.0.0.0:${PORT}`));
