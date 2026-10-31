# Hosting on Cloudflare Pages

CogniRun can run on Cloudflare Pages, the same host as Quizrun and Food-enough.
Cloudflare builds straight from GitHub, so deploys use no GitHub Actions minutes.

- The web app is built from `web/` into `web/dist`.
- The API is `functions/`, a set of Cloudflare Pages Functions:

  | Function | Route |
  | --- | --- |
  | `functions/health.js` | `/health` |
  | `functions/questions.js` | `/questions` |
  | `functions/api/{config,judge,tts,stt}.js` | `/api/*` |

  These functions mirror `api/*.mjs` (Vercel) and use the same shared code in
  `question-server/`. `question-server/test/pages-functions.test.mjs` checks them.

Vercel keeps serving https://cognirun.vercel.app until the cutover below is done.

## Run it locally in Cloudflare's runtime

```bash
npm --prefix web run build
npm run cf:dev            # http://127.0.0.1:8788, web app + functions
SMOKE_URL=http://127.0.0.1:8788 npm run smoke:prod
```

To test the judge or voice locally, put the server keys in a git-ignored
`.dev.vars` file in the repo root, one `KEY=value` per line.

## One-time setup (Cloudflare dashboard, about 5 minutes)

1. In **Workers & Pages**, choose **Create → Pages → Connect to Git**, then pick
   `julia-meshcheryakova/cognirun`.
2. Enter these build settings:

   | Setting | Value |
   | --- | --- |
   | Project name | `cognirun` (the app then lives at `https://cognirun.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `web/dist` |
   | Root directory | *(leave empty)* |

3. Under **Environment variables**, add these for Production (and Preview if you
   want previews to work):

   | Variable | Type | Value |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | text | `https://rbnnlbhlvtcthyqnuioq.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | text | the anon key from `web/.env.local` |
   | `GROQ_API_KEY` | secret | Groq key (answer judge) |
   | `ELEVENLABS_API_KEY` | secret | ElevenLabs key (voice) |
   | `NODE_VERSION` | text | `22` |

   The `VITE_` values are public and get baked into the build. The two keys stay
   on the server.
4. Click **Save and Deploy**, then check the result with
   `SMOKE_URL=https://cognirun.pages.dev npm run smoke:prod`.

Every push to `main` then deploys to production, and every other branch gets a
preview URL.

## Cutover from Vercel

Do this once the Pages deploy passes the smoke check:

1. In `web/src/config.js`, set `DEPLOYED_SERVER` to the Pages URL. This is the
   API that the Android app calls. Then ship a new APK tag.
2. In `scripts/smoke-prod.mjs`, change the default URL. Also update the
   `android-build.yml` comment.
3. In Supabase, go to **Auth → URL configuration** and change the Site URL to the
   Pages URL. `https://cognirun.pages.dev/**` is already in the redirect allow list.
4. Disconnect Vercel: either use **Vercel → cognirun → Settings → Git →
   Disconnect**, or remove the repository from the Vercel GitHub app. After that,
   delete `api/` and `vercel.json`.
