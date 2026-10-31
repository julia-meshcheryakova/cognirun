# Accounts and sync (Supabase)

CogniRun works without an account: runs are saved on the device (localStorage).
With Supabase configured, people can sign in (email magic link or Google), their
runs are uploaded to their account, and the history and progress screens show runs
from every device. Challenge leaderboards read from the same tables.

This is a **separate Supabase project from Quizrun**. Nothing here is shared with it.

- Schema: `supabase/migrations/` · tests: `supabase/tests/` (pgTAP)
- Client: `web/src/supabase.js` (lazy), `web/src/auth/`, `web/src/history/remoteStore.js`,
  `web/src/history/syncedStore.js`, account screen `web/src/ui/account.js` (`#/account`)

When `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing at build time, the
app is local-only: no network calls, supabase-js is never downloaded (it is a
separate lazy chunk), and the **You** tab just says sign-in is not configured.

## Data model

| Table / function | What it holds | Who can access it |
| --- | --- | --- |
| `profiles` | one row per user (`id` = `auth.users.id`), `display_name` (1–40 chars), `is_admin`, timestamps. Created by the `on_auth_user_created` trigger on sign-up; the name comes from the sign-up metadata (Google full name) or the email's local part. | A user reads their own row and can update only `display_name`. Admins read all rows. `is_admin` is changed only with SQL. |
| `runs` | one row per `RunRecord`. `id` is the client-generated record id (primary key), so uploads are idempotent upserts. `route` is `jsonb`. `challenge_id` is a plain text id (no foreign key). `created_at` is the upload time, set by the server. | Own rows only (select/insert/update/delete). Once uploaded, a run's result is locked: the `runs_guard` trigger rejects changes to `started_at`, `finished_at`, `mode`, `challenge_id`, `course`, `demo`, `distance_m`, `duration_s`, `points`, `correct` and `total` (admins and the service role excepted). |
| `run_answers` | one row per answer (`run_id`, `idx`), with `question_id`, `category`, `km`, `elapsed_s`, `correct`, `points`, `method`. Foreign key `(run_id, user_id)` → `runs`, so an answer always belongs to its run's owner. Deleted with the run. | Own rows only. |
| `my_category_stats` (view) | per-category answered / correct / average time / points for the caller, non-demo runs. | Runs as the caller (`security_invoker`). |
| `challenges` | `id` such as `2026-W02-5k`, `course`, `title`, `theme`, `starts_at`, `ends_at`, `question_ids text[]`. | Everyone reads. Only admins (`profiles.is_admin`) or the service role write. |
| `profiles.terms_version`, `profiles.terms_accepted_at` | the Terms/Privacy version the user agreed to, and when. Set only through `accept_terms(p_version)` (RPC). The app compares it with `TERMS_VERSION` in `web/src/legal.js`. Until it matches, uploads pause (sync state `needs-consent`) and the You tab asks the user to agree. | Own row, through the RPC only (`authenticated`). |
| `delete_my_account()` (RPC) | deletes the caller's `auth.users` row; profile, runs and answers go with it by cascade. | `authenticated` only, and only for the caller. |
| `challenge_leaderboard(p_challenge_id, p_limit = 100)` (RPC) | best non-demo run per user for a challenge (most points, then fastest, then earliest), finished within the challenge window and uploaded no later than a day after it closed. Returns `rank, display_name, points, correct, total, duration_s, distance_m, finished_at, is_me`. No user ids, emails or routes. | Anyone (`anon` and `authenticated`). |

Scores are taken from the client as submitted, but they cannot be rewritten after
upload, and a run backdated into a closed challenge does not count. A server-side
recompute of points from `run_answers` is a later step, before leaderboards carry
prizes.

### How the app syncs

`createSyncedRunStore` (in `main.js`) keeps the `RunStore` contract of `store.js`:

- **save**: written to the device first with `synced: false`, then uploaded in the
  background when signed in, and marked `synced: true`. A run that fails to upload
  stays unsynced and does not block the others; the account screen shows the error
  and "Sync now" retries.
- **sign-in**: every unsynced run on the device is uploaded, including runs made
  before the account existed.
- **list**: device and account runs merged, deduped by `id` (the device copy wins),
  newest first. Offline, it falls back to the device.
- **sign-out**: synced runs are removed from the device (they stay in the account),
  so the next person on a shared phone does not see them. Unsynced runs stay, and so
  does a run that was mid-upload. If the app starts offline with an expired session,
  that is not treated as a sign-out: nothing is removed, the account screen says it
  will reconnect, and the session comes back when the device is online.
- Extra methods for the account screen: `sync()` ("Sync now") and `syncStatus()`
  (`{ state, unsynced, lastSyncedAt, error }`).

## Owner setup (one time)

### 1. Create the project

1. In the [Supabase dashboard](https://supabase.com/dashboard), **New project**
   (e.g. `cognirun`, a region near your runners). Save the database password.
2. **Project Settings → API**: note the **Project URL**
   (`https://<project-ref>.supabase.co`) and the **anon / publishable** key. The
   anon key is public by design (RLS protects the data). **Never** put the
   `service_role` / secret key in a `VITE_` variable or in the app.

### 2. Push the schema

From the repo root (Docker is not needed for this):

```bash
npx supabase login                               # opens the browser once
npx supabase link --project-ref <project-ref>    # asks for the database password
npx supabase db push                             # applies supabase/migrations
```

Later schema changes: add a new file under `supabase/migrations/`, test it locally
(below), then `npx supabase db push` again.

### 3. Auth URLs

**Authentication → URL Configuration**:

- **Site URL**: `https://cognirun.vercel.app`
- **Redirect URLs** (add each):
  - `https://cognirun.vercel.app/**`
  - your Render URL, e.g. `https://cognirun-app.onrender.com/**`
  - `http://localhost:5173/**` and `http://localhost:4173/**` (dev and preview)
  - `com.cognirun.app://auth-callback` (the Android app)
  - optional, Vercel previews: `https://*-<your-vercel-team>.vercel.app/**`

The app asks Supabase to redirect back to the page it is on (web) or to
`com.cognirun.app://auth-callback` (Android). A redirect that is not in this list
falls back to the Site URL.

**Email**: magic links work out of the box, but Supabase's built-in mailer is
heavily rate-limited (a few emails per hour). Before inviting people, set up custom
SMTP under **Authentication → Emails → SMTP settings** (e.g. Resend, Postmark,
SES). The default "Magic Link" template works as is (the app uses the PKCE flow).

### 4. Google sign-in

1. [Google Cloud Console](https://console.cloud.google.com/) → create or pick a
   project → **APIs & Services → OAuth consent screen**: External, app name
   "CogniRun", support email, scopes `openid`, `email`, `profile`. Publish it (or add
   test users while it is in testing).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://cognirun.vercel.app`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase **Authentication → Sign In / Providers → Google**: enable it and paste
   the client ID and secret.

The Android app uses the same web client: it opens Google in a Chrome Custom Tab
(Google blocks sign-in inside WebViews) and gets back through the deep link.

### 5. Environment variables

The two variables are read **at build time** by Vite, so redeploy after changing them.

| Where | How |
| --- | --- |
| Local dev | copy `web/.env.example` to `web/.env.local` and fill it in (git-ignored) |
| Vercel | Project → Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production, and Preview if wanted) → redeploy |
| Render | `cognirun-app` → Environment: the same two keys (the build runs `npm run build`) → Manual Deploy |
| Android, local build | put them in `web/.env.local`, then `npm run android` |
| Android, release APK | add repository **variables** (Settings → Secrets and variables → Actions → Variables) `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and pass them to the "Build web app + sync Capacitor" step of `.github/workflows/android-build.yml`: |

```yaml
      - name: Build web app + sync Capacitor
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

(That workflow edit was left to the owner on purpose; without it the APK is local-only.)

### 6. Make yourself admin (for the later admin page)

Sign in once, then in the SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Admins can create and edit `challenges` from the app. Without an admin page yet,
insert them in the SQL editor (it runs as the service role):

```sql
insert into public.challenges (id, course, title, starts_at, ends_at, question_ids)
values ('2026-W02-5k', '5k', 'Week 2 · 5K', '2026-01-05', '2026-01-12', array['t1','l1','m1','t2','l2']);
```

## Android redirect handling

- `android/app/src/main/AndroidManifest.xml` has an intent filter on `MainActivity`
  (already `singleTask`) for `com.cognirun.app://auth-callback`.
- `@capacitor/app` delivers the link (`appUrlOpen`, or `getLaunchUrl()` on a cold
  start); `web/src/auth/session.js` exchanges the `?code=` for a session.
  `@capacitor/browser` opens Google in a Custom Tab.
- In the app, supabase-js does not read the WebView URL (`detectSessionInUrl` is off).
- Both plugins are registered in `android/capacitor.settings.gradle` and
  `android/app/capacitor.build.gradle` (`npx cap update android` regenerates them).

Limitation: PKCE ties a magic link to the browser or app that asked for it. A link
requested in the app must be opened on that phone (it opens the app). A link
requested on a laptop and opened on a phone fails with "link invalid or expired".
The account screen says so and the user can request a new one.

## Local development

Needs Docker. The stack uses ports 553xx so it does not collide with other local
Supabase projects (e.g. Quizrun on 543xx).

```bash
npm run db:start      # npx supabase start: Postgres, Auth, API, Studio, Mailpit
npm run db:test       # pgTAP tests in supabase/tests (RLS, profile trigger, leaderboard)
npm run db:reset      # re-apply migrations from scratch
npm run db:stop
```

- API `http://127.0.0.1:55321` · Studio `http://127.0.0.1:55323` · Mailpit (catches
  magic-link emails) `http://127.0.0.1:55324`
- `npx supabase status` prints the local anon key. Put it in `web/.env.local` with
  `VITE_SUPABASE_URL=http://127.0.0.1:55321` and run `npm --prefix web run dev`.
- Google sign-in is off locally. To try it, set `enabled = true` under
  `[auth.external.google]` in `supabase/config.toml`, export
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`,
  and add `http://127.0.0.1:55321/auth/v1/callback` to the Google client's redirect URIs.

`npm run check -- --db` adds the pgTAP tests to the local gate (stack must be
running). The default `npm run check` does not need Docker. Unit tests for the
client (`web/test/supabase-auth.test.mjs`, `sync-store.test.mjs`,
`account.test.mjs`) use an in-memory fake client (`web/test/fakeSupabase.mjs`).
