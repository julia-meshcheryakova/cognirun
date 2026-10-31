# API and hosting memo

Scope: every endpoint on the four hosts: Vercel `api/*.mjs` (live), Cloudflare `functions/` (never cut over), Render `serve-app.mjs` + `render.yaml` (never deployed) and the local `question-server/server.mjs` (:4000), plus the shared `question-server/{apiGuard,llmJudge}.js`, `vercel.json`, `web/public/_headers`, `web/vite.config.js` and `web/src/config.js`.

How it was checked: by reading the code; `curl https://cognirun.vercel.app/health`; `npm test --prefix question-server` (33/33 pass); and throwaway probes. The probes ran `server.mjs` and `serve-app.mjs` on free ports with no keys, and called the Vercel and Cloudflare handlers in-process with a stubbed `fetch`. No paid upstream was called.

## Today's behaviour

- **Base URL:** the web build calls its own origin (`''`, `config.js:39`) and the APK calls `https://cognirun.vercel.app` (`config.js:32-37`). `vite dev` calls `http://localhost:4000` cross-origin; there is **no** Vite proxy (`vite.config.js` only sets `fs.allow` and `define`).
- **Production has neither key.** Live `/health` returns `{"ok":true,"questions":383,"eleven":false,"groq":false}`. So every `/api/tts` and `/api/judge` call gets a 503, and the client falls back to browser speech and local matching.
- **`GET /questions`:** the whole bank. It is fetched at run start with a 2 s timeout; if that fails, the bundled copy is used (`questions.js:24-41`). On Vercel it is a rewrite to `/api/questions` (`vercel.json:6`).
- **`GET /api/config`:** `{ elevenLabs }`. Only the STT probe reads it (`stt.js:45`); TTS just tries `/api/tts`.
- **`POST /api/tts {text}`:** text trimmed to 1000 chars, returns ElevenLabs mp3. Any failure means browser speech (`tts.js:69`).
- **`POST /api/stt`:** takes the raw recorder blob (100 B to 2 MB, filename from `x-audio-filename`) and returns ElevenLabs `{text}` (`stt.js:89-93`).
- **`POST /api/judge {questionId, text}`:** the server looks the question up and cuts the text to 300 chars, then asks Groq with a 6 s timeout. Answers: `{correct, reason}`; 503 with no key; 400 for an unknown id or empty text; 502 if Groq fails (`llmJudge.js:82-91`).
- **Paid-endpoint guard** (`apiGuard.js:87-101`, all hosts): OPTIONS gives 204 or 403, and a non-POST gets 405. A foreign or missing Origin gets 403. A `Content-Length` over the cap gets 413. Over 40/30/60 requests a minute from one IP (tts/stt/judge) gets 429, counted in memory per instance.
- **Headers:** Vercel adds the `vercel.json` security headers to every response, the API included (seen in the live `/health` response, served from function region `iad1`).

## Facts checked against code

| Claim | Evidence (file:line) | Verdict |
| --- | --- | --- |
| README:21-23: the four API copies "must stay in sync" | the tables below | a requirement, **violated**: they have drifted |
| README:162-164: oversized bodies get 413 | `apiGuard.js:97` checks `Content-Length` only (bug 4) | **wrong** for chunked bodies |
| README:157,159: `ALLOWED_ORIGINS` extends a built-in list; `/health` reports `groq`/`eleven` | `apiGuard.js:7-18,31-35`; `api/health.mjs:8-9` | confirmed |
| README:166-169: two identical header copies, and `csp.spec` fails on drift | `csp.spec.mjs:14-17` compares only the CSP; `/assets/*` caching is only in `_headers:10-11` | **partly wrong** (the `/*` blocks match today) |
| README:147-148, MVP-PLAN:372: env vars, CSP and HSTS on Render | `serve-app.mjs:81` (static files only); never deployed | stale |
| `android-build.yml:5-6`: Vercel holds `GROQ_API_KEY`/`ELEVENLABS_API_KEY` | live `/health`: `eleven:false, groq:false` | **wrong today** |
| MVP-PLAN:149-150: "`/health` currently reports `eleven: false`" | live `/health` | confirmed, and `groq` is false too |
| MVP-PLAN:84: paid endpoints are open, `CORS *`, no rate limit | `apiGuard.js:87-101`, imported by all four hosts | stale |
| MVP-PLAN:133: judge "wired into all three servers" | `api/judge.mjs:1`, `functions/api/judge.js:2`, `serve-app.mjs:5`, `server.mjs:4` | stale (four) |
| MVP-PLAN:361-364: the guard is on all four surfaces and "caps body sizes" | the imports above; for body caps see bug 4 | confirmed / partial |
| QUESTIONS-SPEC:198, `question-server/README.md:14`: `/health` returns `{ ok, questions }` | `server.mjs:177-182` also returns `eleven`, `groq` | stale |
| QUESTIONS-SPEC:201-202: the server URL defaults to `http://localhost:4000` | `config.js:34-40`: dev only (`''` in prod, Vercel URL in the APK) | stale |
| CLOUDFLARE.md:15-16: functions mirror `api/*.mjs` and are tested | `pages-functions.test.mjs:4-10` tests all six functions; judge and tts differ from `api/` (below); grep finds no test importing `api/` or `serve-app` | **partly wrong**: tested, but no test proves parity with Vercel, and edge cases drifted |
| `llmJudge.js:3-5`: not usable as a general LLM proxy | `llmJudge.js:83` (id lookup), `:12,85` (300 chars) | confirmed |

## Differences between the four copies

Columns are Vercel `api/`, Cloudflare `functions/`, Render `serve-app.mjs`, local `server.mjs`. "Verified" means probed; everything else is from reading the code.

| `/health`, `/questions`, `/api/config` | Vercel | Cloudflare | Render | Local |
| --- | --- | --- | --- | --- |
| `?category=unknown` | 200, 0 questions (`questions.mjs:5`, verified) | 200, 0 (`questions.js:6`) | 200, 0 (`:75`, verified) | **400** (`server.mjs:187-189`) |
| `categories` when filtered | full list (verified) | full list | full list | `[category]` (`:114`) |
| `cache-control` | Vercel default | none | none | `no-store` (`:125`) |
| OPTIONS / unknown path | handler runs; platform 404 | handler runs; `/index.html` (SPA fallback: no top-level `404.html` in `web/public`) | 204 (`:70`); SPA `index.html` (`:78-80`) | 204 (`:148-155`); 404 JSON (`:184`) |

| `/api/tts`, `/api/stt` | Vercel | Cloudflare | Render | Local |
| --- | --- | --- | --- | --- |
| No key | 503 `no key` (`tts.mjs:18`, `stt.mjs:32`) | 503 `no key` | 503 `no key` (verified) | 503 `ElevenLabs is not configured.` (`:38-41`, verified) |
| tts: invalid JSON | Vercel body helper (unverified) | read as `{}`, so 400 `text is required` (`tts.js:19`) | 400 `bad request` (`:30,68`) | 400 `invalid JSON` (`:44-49`) |
| Chunked body over the cap | stt 413 by streaming cap (`stt.mjs:9-18,34`, verified); tts not capped | stt reads everything, then 413 (`stt.js:20-21`); tts not capped (verified) | 400 `bad request` (`:22,68`) | connection dropped (`:25-28`) |
| Upstream non-2xx (tts) | upstream status, labelled `audio/mpeg` (`tts.mjs:30-31`, verified) | same (`tts.js:31`) | same (`:34`) | upstream status, `text/plain` (`:69-71`) |
| Upstream network error | handler throws; platform 500 (verified) | throws (verified) | 400 `bad request` (`:68`) | 500 `voice bridge error` (`:171-174`) |
| CORS after the guard passes | guard headers (echoed origin, `vary`) | guard | guard (verified) | **`*`, no `vary`** (`:39,58,76,105`, verified) |
| Extras | tts buffered | tts streamed (`tts.js:31`) | — | tts cache of 81 (evicts at `size > 80`, then inserts), `no-store` (`:55-60,74-76`) |
| Guard `allowHeaders` (tts) | `content-type` | `content-type` | `+ x-audio-filename` (`:66`) | `+ x-audio-filename` (`:139`) |

| `/api/judge` | Vercel | Cloudflare | Render | Local |
| --- | --- | --- | --- | --- |
| Body | `req.body ?? {}` (`judge.mjs:15`) | `request.json().catch(() => ({}))` (`judge.js:17`) | `raw` + `JSON.parse` (`:39`) | `readBody` + `JSON.parse` (`:163`) |
| Invalid JSON | unverified | **400 `unknown questionId`** (verified) | 400 `invalid JSON` (verified) | 400 `invalid JSON` (verified) |
| Chunked body over 16 KB | not capped | not capped | 400 **`invalid JSON`** (verified) | connection dropped (verified) |
| Groq key | `process.env` (`llmJudge.js:76`) | `env` passed in (`judge.js:19-22`) | `process.env` | `process.env` |

## Bugs

1. **Production runs with neither key.**
   - Symptom: on the web and in the APK, answers are only string-matched, and questions fall back to browser speech, which is silent in the Android WebView (`server.mjs:10-11`).
   - Cause: `GROQ_API_KEY` and `ELEVENLABS_API_KEY` are not set on Vercel production.
   - Verified: live `/health` (curled while writing this memo) returned `eleven:false, groq:false`. `npm run smoke:prod` would fail two checks (`smoke-prod.mjs:20-21`).
   - Severity: **high**. The fix is in the Vercel dashboard, not the code (Q5).
2. **The rate limit can be bypassed with a fake IP header on directly reached Node hosts, and possibly on Vercel.**
   - Cause: `clientIp` prefers `cf-connecting-ip`, then the first `x-forwarded-for` hop (`apiGuard.js:52-55`), on every host. Cloudflare sets `cf-connecting-ip` itself, and Vercel overwrites `x-forwarded-for` with the real client IP ([Vercel docs](https://vercel.com/docs/headers/request-headers#x-forwarded-for)). Nothing sets either header on a directly reached Node host (local, Render).
   - Verified on `server.mjs`: 41 POSTs from one IP get a 429 on the 41st. 60 POSTs with a new `cf-connecting-ip` each get no 429, and the same for a new first `x-forwarded-for` hop. Scripts can also fake `Origin`, so the limit is the only brake.
   - Remaining Vercel risk, not verified: a client-sent `cf-connecting-ip` may pass through to the function (`api/{tts,stt,judge}.mjs:12,25,9`) and win over `x-forwarded-for` (checking means calling a live paid endpoint).
   - Simplest fix: on Vercel read the first `x-forwarded-for` hop and ignore `cf-connecting-ip`; on Cloudflare read `cf-connecting-ip`; on Node use the socket address.
   - Severity: **low to medium** (confirmed only on the dev server and a dead host; unverified on Vercel).
3. **ElevenLabs calls have no timeout, and network errors are not caught on Vercel or Cloudflare.**
   - Cause: `api/tts.mjs:22`, `api/stt.mjs:46`, `functions/api/tts.js:23`, `functions/api/stt.js:32` and `server.mjs:61,97` call `fetch` with no `AbortSignal`. Groq has a 6 s timeout (`llmJudge.js:11,45`).
   - Verified: with a rejecting `fetch` stub, both tts handlers throw. The platform then sends a 500 with no CORS headers, which the cross-origin APK sees as a network error. A hang lasts until the function's time limit, and `ui/question.js:42` awaits `speak()`, whose `fetch` has no timeout either (`tts.js:40`).
   - Severity: **low to medium**.
4. **Chunked bodies over the cap are mishandled on the Node hosts.**
   - Cause: `server.mjs:25-28` destroys the socket, so the client gets no response. `serve-app.mjs:22,39` answers 400 `invalid JSON`. README:164 promises 413.
   - Verified: a chunked 20 KB POST to `/api/judge` got a closed connection from `server.mjs` and a 400 from `serve-app.mjs`.
   - Severity: **low** (the dev server and a dead host).
5. **TTS upstream errors are labelled as audio.**
   - Cause: `api/tts.mjs:30-32` (also `functions/api/tts.js:31` and `serve-app.mjs:34`) pass on ElevenLabs' status and JSON body as `audio/mpeg`, so an upstream 401 or 429 looks like our own auth or rate limit.
   - Verified with a stubbed 401. The client only checks `ok` (`tts.js:45`).
   - Severity: **low**.

**Suspicions (not verified):**

- `api/stt.mjs:6-7` exports `config.api.bodyParser`. That is a Next.js option and is probably ignored here.
- Vercel's handling of invalid JSON in `req.body` (`judge.mjs:15`, `tts.mjs:20`) is unknown.
- The client judge timeout equals the server's Groq timeout (6 s, `judge.js:12` and `llmJudge.js:11`). The client probably aborts first and never sees the 502.
- With no key, `tts.js:63-69` still spends a POST and a rate-limit token on each question, because it never checks `/api/config`.
- Functions run in `iad1` (US East) behind the `fra1` edge (from `X-Vercel-Id`), which may add latency for European runners.

## Proposal

1. **Delete Render** (plan step 1.4); see "What to delete". *needs answer: Q1*
2. **Add the shared handler `question-server/api.js`** (~120 lines), next to `apiGuard.js` and `llmJudge.js`, which every host already imports.
   - It exports `handle(route, request, env, { ip }) → Response` on standard `Request`/`Response`. `route` is a canonical name (`health`, `questions`, `config`, `tts`, `stt`, `judge`) passed by the adapter, so URL paths do not matter: Vercel serves `/api/health` and `/api/questions` (`vercel.json:5-7` rewrites), Cloudflare and Node serve `/health` and `/questions`. An unknown route returns 404.
   - Every paid response carries the guard headers. Invalid JSON gets 400. A streaming byte cap gives 413 for all three paid endpoints. ElevenLabs gets a 10 s timeout (504), and upstream errors come back as JSON 502.
   - The voice defaults are written once.
   - Add `api.test.mjs`, which calls `handle()` directly for the shared logic. It does not cover the hosts: `pages-functions.test.mjs` (all six Cloudflare functions) and `server.test.mjs` stay as adapter tests and must keep passing.
   - Make the six `functions/` files two-liners, e.g. `export const onRequest = ({ request, env }) => handle('tts', request, env, { ip: request.headers.get('cf-connecting-ip') });`.
   - This fixes bugs 3-5. *needs answer: Q2 (adapters only), Q3, Q4*
3. **Make the six `api/*.mjs` files Vercel adapters:** e.g. `export default { fetch: (r) => handle('tts', r, process.env, { ip: r.headers.get('x-forwarded-for')?.split(',')[0].trim() }) }`, never reading `cf-connecting-ip`. Before merging, run `SMOKE_URL=<preview> npm run smoke:prod` and answer one question by voice. This closes the possible `cf-connecting-ip` bypass on the live host (bug 2). *needs answer: Q6*
4. **Make `server.mjs` a Node adapter** (~30 lines): map the pathname to a route, turn `IncomingMessage` into a `Request` (`Readable.toWeb`, `duplex: 'half'`), take `ip` from `req.socket.remoteAddress` (fixes bug 2 there), write the `Response` back, then `listen`. `server.test.mjs` stays as the adapter's test. *needs answer: Q3, Q4*
5. **Fix the docs:** cut README:12-23,147-169 down to "one handler, three thin hosts", and fix QUESTIONS-SPEC:197-202, `question-server/README.md:10-14`, CLOUDFLARE.md:7-16 and MVP-PLAN:84,133. *no answer needed*

Size of the host code, before → after:

| Part | Before (lines) | After (lines) |
| --- | --- | --- |
| `api/` | 128 | ~18 |
| `functions/` | 126 | ~12 |
| `serve-app.mjs` + `render.yaml` | 101 | 0 |
| `server.mjs` | 195 | ~30 |
| `apiGuard.js` | 101 | ~90 |
| `api.js` (new) | 0 | ~120 |
| **Total** | **~650** | **~270** |

The four-way jscpd clone goes away.

## What to delete

- **Render (Q1):**
  - Files: `serve-app.mjs`, `render.yaml`.
  - Lines: `package.json:8` (`start`), `tsconfig.json:22`, `apiGuard.js:10` (the `onrender.com` origin), and the comments at `apiGuard.js:2` and `llmJudge.js:71`.
  - Docs: README:14,22,148,167-168, SUPABASE.md:93, MVP-PLAN:167,372.
  - Evidence: a grep for `serve-app|onrender|render.yaml` finds no other executable consumers; no workflow or test uses them. Other doc references: `docs/refactoring-plan.md:12,18,46,55,93,124,129,136,161`.
- **Per-host bodies:**
  - `server.mjs:12-117` (`readBody`, `handleTts`, `handleStt`, `payload`, `ttsCache`) and `server.mjs:147-190`.
  - In `api/*.mjs` and `functions/**/*.js`, everything except the adapter lines, including `api/stt.mjs:6-18` (the `config` export and `raw`).
- **`clientIp`** (`apiGuard.js:52-55`) and its test (`apiGuard.test.mjs:24-29`). Each adapter passes `ip` instead.
- **The `?category=` filter (Q3):**
  - Code and tests: `server.mjs:110-117,186-189`, `api/questions.mjs:4-5`, `functions/questions.js:5-6`, `server.test.mjs:84-98,103-105`.
  - Docs: QUESTIONS-SPEC:197, `question-server/README.md:13`.
  - Evidence: the only client call is `${url}/questions` (`web/src/questions.js:28`); grep finds no `category=` in `web/src` or `e2e`.
- **The dev TTS cache (Q4):** `server.mjs:2,16,55-60,74-75`.
- **Keep:**
  - `functions/package.json`: it makes `functions/*.js` ESM for the Node tests.
  - `cf:dev`: if Q2 keeps Cloudflare.
  - The `vercel.json:5-8` rewrites.

## Questions

1. **(plan Q1) Delete Render?** **Default:** yes. It was never deployed and is a full fourth copy of the API.
2. **(plan Q2) Keep `functions/`?** **Default:** keep, as six two-line adapters. Once `handle()` exists that costs about 12 lines.
3. **Drop `?category=` on `/questions`?** **Default:** yes. No client sends it, and the hosts already disagree on it (400 or 200).
4. **Drop the dev TTS cache in `server.mjs`?** **Default:** yes. Only the dev server has it, and it only saves ElevenLabs credit while developing.
5. **Is running production without `GROQ_API_KEY`/`ELEVENLABS_API_KEY` intended?** **Default:** no; set both on Vercel production. Without them the APK has no voice and the judge is off.
6. **For the Vercel adapter, use the web-handler `export default { fetch }` or a ~10-line Node-to-`Request` shim?** **Default:** the web handler. It matches Cloudflare exactly; fall back to the shim only if the preview smoke check fails. Either way it takes `ip` from the first `x-forwarded-for` hop (set by Vercel) and ignores `cf-connecting-ip` (bug 2).
