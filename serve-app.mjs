import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { QUESTION_LIBRARY as lib } from './question-server/questions.js';
import { judgeRequest } from './question-server/llmJudge.js';
import { guard, clientIp, LIMITS, MAX_TTS_CHARS } from './question-server/apiGuard.js';

const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const web = resolve('web/dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-audio-filename', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

const PAID = { '/api/tts': 'tts', '/api/stt': 'stt', '/api/judge': 'judge' };

// Security headers for pages: the `/*` block of web/public/_headers, shared with Cloudflare Pages (and vercel.json).
function parseHeaders(text) { const out = {}; let all = false; for (const line of text.split(/\r?\n/)) { if (/^\S/.test(line)) { all = line.trim() === '/*'; continue; } const m = all && line.match(/^\s+([\w-]+):\s*(.+)$/); if (m) out[m[1].toLowerCase()] = m[2].trim(); } return out; }
const PAGE_HEADERS = await readFile(join(web, '_headers'), 'utf8').then(parseHeaders).catch(() => ({}));

async function raw(req, limit = LIMITS.stt.maxBytes) { const c = []; let n = 0; for await (const x of req) { n += x.length; if (n > limit) throw new Error('body too large'); c.push(x); } return Buffer.concat(c); }
/** @param {Record<string, string>} [cors] */
function json(res, code, obj, cors = CORS) { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); }

// Paid endpoints, reached only after guard() passed; CORS here is the guard's headers.
async function paid(kind, req, res, CORS) {
  if (kind === 'tts') {
    if (!KEY) return json(res, 503, { error: 'no key' }, CORS);
    const b = JSON.parse((await raw(req, LIMITS.tts.maxBytes)).toString() || '{}');
    const text = String(b.text || '').trim().slice(0, MAX_TTS_CHARS);
    if (!text) return json(res, 400, { error: 'text is required' }, CORS);
    const up = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ text, model_id: TTS_MODEL }) });
    res.writeHead(up.status, { 'content-type': 'audio/mpeg', ...CORS });
    return res.end(Buffer.from(await up.arrayBuffer()));
  }
  if (kind === 'judge') {
    let input;
    try { input = JSON.parse((await raw(req, LIMITS.judge.maxBytes)).toString() || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }, CORS); }
    const { status, body } = await judgeRequest(input);
    return json(res, status, body, CORS);
  }
  if (kind === 'stt') {
    if (!KEY) return json(res, 503, { error: 'no key' }, CORS);
    const audio = await raw(req);
    if (audio.length < 100) return json(res, 400, { error: 'no usable audio' }, CORS);
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
  return json(res, 404, { error: 'not found' }, CORS);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const kind = PAID[url.pathname];
  if (kind) {
    const check = guard(kind, { method: req.method, origin: req.headers.origin, host: req.headers.host, ip: clientIp((n) => req.headers[n]), size: req.headers['content-length'], extraOrigins: process.env.ALLOWED_ORIGINS, allowHeaders: 'content-type, x-audio-filename' });
    if (!check.ok) { res.writeHead(check.status, { 'content-type': 'application/json', ...check.headers }); return res.end(check.body ? JSON.stringify(check.body) : undefined); }
    try { return await paid(kind, req, res, check.headers); } catch { return json(res, 400, { error: 'bad request' }, check.headers); }
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') return json(res, 200, { ok: true, questions: lib.questions.length, eleven: Boolean(KEY), groq: Boolean(process.env.GROQ_API_KEY) });
  if (url.pathname === '/api/config') return json(res, 200, { elevenLabs: Boolean(KEY) });
  if (url.pathname === '/questions') {
    const cat = url.searchParams.get('category');
    const out = cat ? { ...lib, questions: lib.questions.filter((q) => q.category === cat) } : lib;
    return json(res, 200, out);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let f = join(web, p);
  try { const s = await stat(f); if (s.isDirectory()) f = join(f, 'index.html'); } catch { f = join(web, 'index.html'); }
  try { const data = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', ...CORS, ...PAGE_HEADERS }); res.end(data); }
  catch { res.writeHead(404); res.end('not found'); }
});
const PORT = Number(process.env.PORT || 4173);
server.listen(PORT, '0.0.0.0', () => console.log(`CogniRun on http://0.0.0.0:${PORT}`));
