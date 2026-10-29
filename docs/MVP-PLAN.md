# CogniRun → MVP plan

CogniRun is the pivot from Quizrun: the same "run + think" idea, but solo, any time,
anywhere, scored by an app instead of an event crew. If it lands, Quizrun becomes
**Quizrun Pro** (the hosted event product) and CogniRun is the everyday app that
feeds it. This document is the analysis behind that, and the plan to get CogniRun
from a polished demo to an MVP real people sign up for and come back to.

## 1. Where CogniRun is today

**What works well**

- A complete solo run loop: 3 km (also 300 m / 60 m test courses), a question at
  each kilometre (trivia → logic → maths), time-decay scoring (100 → 50 points over
  60 s, 0 if wrong), results with breakdown, percentiles, route and pace charts.
- Real sensors: GPS (browser or Capacitor) with accuracy/jitter filtering; BLE heart
  rate (any 0x180D strap or Garmin broadcast) with reconnect backoff.
- Voice: questions read aloud, answers spoken. ElevenLabs via the server with a
  browser Web Speech fallback, and careful handling so the mic never records the TTS.
- Grading pipeline: exact → contains → LLM judge (now server-side, see §4).
- A deterministic simulated clock with a demo mode up to x1000 and a scrubber,
  which makes the whole flow testable headless.
- Good unit coverage for its size: 104 web tests and 8 question-server tests.
- Deploys: Vercel auto-deploys `main` (web + `api/*` functions) and the Android
  APK is built with Capacitor.

**What is missing for an MVP**

| Area | State |
| --- | --- |
| Accounts | None. No registration, no identity, nothing persisted. |
| Runs | Lost on reload. No history and no per-user stats. |
| Leaderboard | Synthetic (stub normal distribution), not real people. |
| Questions | 30 hand-written questions, and every run asks the *same* three (`selectRunQuestions` takes the first per category). |
| Challenges / friends / badges | None. |
| Admin | None. Questions are edited in `question-server/questions.js`. |
| Navigation | Two screens only (setup → live → results). Settings live on the setup screen. |
| Stack | Vanilla JS + `innerHTML` templates. Fine for three screens; it will not scale to ten with auth state. |
| API hardening | `/api/tts`, `/api/stt` and `/api/judge` are open (`CORS *`), with no auth and no rate limit, so anyone can spend the ElevenLabs/Groq budget. |
| Harness | Unit tests only. No lint, no e2e, no gate. CI built the APK on every push and PR. *(Fixed in Phase 0.)* |
| Secrets | The Groq key was inlined into the client bundle and shipped inside the public v1.1.0 APK. *(Code fixed in Phase 0; **the key still has to be rotated**.)* |

## 2. CogniRun vs Quizrun

| | Quizrun (`quizrun-web`) | CogniRun |
| --- | --- | --- |
| Product | Hosted events: register, pay, run a GPX course in teams, answer mid-run, results by event | Solo app: run anywhere, the phone asks the questions, instant score |
| Stack | React 18 + TS + Vite + Tailwind/shadcn + React Query | Vanilla JS + Vite |
| Backend | Supabase (Postgres + RLS, Google OAuth, edge functions), Cloudflare Pages Functions (Stripe) | Stateless Node/Vercel functions; no database |
| Auth | Google OAuth, `person_role` (admin, location_host), `is_admin()` RPC | None |
| Admin | Many `/admin` routes (events, locations, results, people) | None |
| Scoring | Total time − 2:30 per correct answer; logs run time vs think time | Points per answer, decaying with answer time |
| Social | Teams per event, "Special Event" badges, `AchievementBadges.tsx` | Synthetic percentiles |
| Harness | Vitest (jsdom), Playwright `e2e/`, `npm run lint` (eslint + `tsc --noEmit`), Prettier, husky + lint-staged, `scripts/pre-pr.sh` | **Now:** ESLint, `node --test`, Playwright, `npm run check` gate, husky pre-push |
| CI | ci.yml on PR + main (lint, test), Supabase migrations replay on PR and apply on main, nightly DB backup | **Now:** PR-only lint/test/build; APK only on `v*` tags |
| Unique strengths | Payments, events, teams, a real community | Voice Q&A, heart rate, LLM grading, simulator, cognitive-fatigue angle |

**What CogniRun should borrow from Quizrun:** the Supabase auth/RLS/admin patterns
(`person_role`, `is_admin()`), the migrations workflow with replay-on-PR, Google
OAuth, the result model that separates run time from think time, and the
React/TS/Tailwind component library. Using one stack is what makes a future merge
("Quizrun Pro = events + CogniRun app") cheap.

**What Quizrun does not have, so CogniRun builds it fresh:** friends, daily/weekly
challenges, a badge framework, and the 2.5 km check-in flow.

## 3. Open PRs — verdict: do not merge either

Both are bot PRs (Devin). They are now `CONFLICTING`, and `main` is 39 commits
ahead of them.

- **#30 Mobile-first CSS** — conflicts in `style.css`, `live.js`, `question.js` and
  `results.js`, and it is superseded by the later "Telemetry UI: instrument-panel
  restyle" on main. **Close it.** Worth cherry-picking by hand during Phase 2:
  `viewport-fit=cover` with safe-area insets, a `.table-scroll` wrapper for wide
  tables on phones, and the `&amp;` mic-label fix.
- **#22 7-stage HR calibration** — forces about 13 minutes of calibration before every
  live run, can only be skipped one stage at a time, has no way back to setup, and
  stores nothing. **Close it.** The idea is good as a *one-time, optional* "HR
  profile" in Settings that saves resting/max HR per user (Phase 2/4), which then
  makes HR zones and the fatigue analysis personal.

## 4. Phase 0 — harness and security *(done in this branch)*

- **Groq key off the client.** `web/src/keys.js` was deleted. Grading calls
  `POST /api/judge` with `{questionId, text}`. The server looks the question up
  itself, so the endpoint is not an open LLM proxy. It is implemented once in
  `question-server/llmJudge.js` and wired into all three servers.
- **Local gate.** `npm run check` runs lint → unit → build → Playwright, and the
  husky pre-push hook runs it. The Playwright e2e covers a full x1000 demo run and
  checks that the shipped bundle contains no API keys.
- **Cheaper CI.** `ci.yml` runs on PRs only. The APK is built only on `v*` tags,
  where it is attached to the release as `cognirun.apk`, and the build has no secrets.
- **`npm run smoke:prod`** checks `/health` (now reports `groq`/`eleven`), that the
  live bundle has no keys, and that `/api/judge` responds.
- **Demo performance.** Live-screen painting was coalesced to one paint per animation
  frame. At x1000 the screen was redrawing the full route ~2,000 times per second
  and the page became unresponsive.

**Your action items (cannot be done from code):**

1. **Rotate the Groq key** in the Groq console. The old key is readable in the
   public v1.1.0 APK. Then delete that release asset or publish v1.1.1 from a tag.
2. On Vercel, set `GROQ_API_KEY` (server-side, *not* `VITE_`-prefixed) and
   `ELEVENLABS_API_KEY`. `/health` currently reports `eleven: false`.
3. In GitHub repo secrets, delete `VITE_GROQ_API_KEY` and `ELEVENLABS_API_KEY`;
   no workflow uses them anymore.
4. Close #22 and #30.

## 5. Target architecture

**Decision: move CogniRun onto Quizrun's stack, incrementally.**

- **Frontend: React 18 + TypeScript + Vite + Tailwind/shadcn + React Router + React
  Query.** Keep the pure logic modules as they are, typed with JSDoc → TS later:
  `run.js`, `clock.js`, `scoring.js`, `judge.js`, `sensors/*`, `stt.js`, `tts.js`,
  `charts.js`. They are already UI-free and tested. Only `ui/*` and `main.js` are
  rewritten as components.
- **Backend: Supabase (Postgres + RLS + Auth + Edge Functions).** This is the same
  mental model as Quizrun. The three Node API surfaces shrink to one set of Vercel
  functions (voice/judge proxies) plus Supabase for data.
  `serve-app.mjs`/Render can be retired once Vercel is the only host.
- **Supabase project: a separate `cognirun` project for now**, so CogniRun can
  iterate on its schema without risking Quizrun's production data. Later, for Quizrun
  Pro, use one auth with SSO or merge the projects. The `profiles` table is keyed by
  `auth.users.id` so either path works.
- **Auth: Google OAuth + email magic link.** Google matches Quizrun. Magic link
  covers runners without Google and is simple on Android.
- **Android:** stay on Capacitor. Add the `@capacitor/app` deep link for the OAuth
  redirect.

### Data model (first cut)

```text
profiles        id (= auth.users.id), handle (unique), display_name, avatar_url,
                role ('user' | 'admin'), units, voice_on, hr_rest, hr_max,
                share_runs ('friends' | 'public' | 'private'), created_at
runs            id, user_id, mode ('solo' | 'quizrun'), course, challenge_id?,
                started_at, finished_at, distance_m, moving_s, think_s,
                points, correct, total, gps_quality ('good' | 'weak' | 'manual'),
                route (jsonb, simplified), hr_avg, hr_max, client_version
run_answers     run_id, idx, question_id, km, elapsed_s, text, correct, method
                ('exact' | 'contains' | 'llm' | 'choice'), points
questions       id, category, topic, prompt, answer, accepted_answers[], options[],
                difficulty, source, status ('draft' | 'live' | 'retired'), created_by
topics          id, slug, title, description (e.g. 'uk-driving-theory')
challenges      id, slug, title, kind ('daily' | 'weekly' | 'thematic' | 'friend'),
                topic_id?, mode, course, question_ids[] (fixed set => fair),
                starts_at, ends_at, created_by, published
challenge_entries challenge_id, user_id, run_id (best counted), score, rank
friendships     requester_id, addressee_id, status ('pending' | 'accepted' | 'blocked')
badges          id, slug, title, description, icon, rule (jsonb)
user_badges     user_id, badge_id, awarded_at, run_id?
pages           slug, title, body_md, published   -- admin-editable CMS pages
```

RLS: users read/write their own runs. Friends read runs where `share_runs` allows
it. Only admins write `questions`, `topics`, `challenges`, `badges` and `pages`.
Leaderboards come from SQL views over `challenge_entries` and `runs`. Scores are
computed **server-side** (an Edge Function recomputes points from `run_answers`)
so the client cannot submit a made-up total.

## 6. Roadmap

Each phase ends with `npm run check` green, `smoke:prod` green, and a short
demo on a phone.

### Phase 1 — Accounts and saved runs

- React/TS shell with the router. Port setup → live → results as components that
  reuse the existing logic modules. The Playwright demo-run spec must stay green
  through the port; it is the regression net.
- Supabase project, migrations folder, local `supabase start` for development, and a
  migrations-replay job on PRs (same as Quizrun).
- Sign up / sign in (Google + magic link), choose a handle, onboarding (units, voice,
  optional HR strap).
- Runs and answers persisted at the end of the run. Runs are queued offline
  (IndexedDB) if there's no signal and uploaded later.
- Real questions randomisation: no repeats within a run, and least-recently-seen first
  per user.
- **Done when:** a new user can register on the phone, run, see the run in History
  after a reload, and a second device sees it too.

### Phase 2 — The app proper (navigation, settings, profile)

Bottom tab bar: **Home · Challenges · Run · Leaderboard · Profile**. Settings is
reached from Profile.

- **Home:** today's daily challenge card, friends' recent activity, your streak.
- **Run:** a pre-run screen with mode (Solo 3k / Quizrun 2.5k / Challenge) and
  course. The live screen stays focused on the run, with no settings on it.
- **Leaderboard:** tabs for Daily / Weekly / Friends / All-time, filterable by topic.
- **Profile:** stats (runs, km, accuracy per category, fatigue curve: accuracy vs km
  and vs HR zone), badges, run history → run detail (reuses the results screen).
- **Settings:** account, units, voice on/off and voice choice, mic test, HR strap
  pairing + optional HR profile (the useful part of PR #22), privacy (who sees my
  runs), data export/delete, sign out.
- Mobile CSS from PR #30 (safe areas, table scroll).
- **Done when:** every feature is reachable in ≤ 2 taps and nothing configurable
  lives on the run screen.

### Phase 3 — Challenges and admin

- **Daily challenge** (default: auto-generated from the live pool at 00:00 UTC; one
  fixed set of questions for everyone, which makes it fair) and **weekly challenge**
  (admin-curated, longer course, the competitive one). We need both: daily drives the
  habit, weekly drives competition.
- **Thematic challenges:** a challenge has a `topic`, e.g. *Driving theory*, *Capital
  cities*, *Company onboarding*. Topics are a question set plus their own leaderboard.
- **Driving-tests exploration:** the run-time format suits *multiple choice with
  short prompts*. Spoken answers to long theory questions are too slow mid-run.
  Official question banks (UK DVSA, etc.) are licensed. Start with **self-written
  questions in the style of** the theory test (road signs as text, stopping
  distances, rules), and pursue a licence only if the topic gets traction.
- **Admin (`/admin`, `role = 'admin'`):**
  - Questions: CRUD, CSV import, LLM-assisted drafting reviewed by a human before
    `live`, retire.
  - Topics.
  - Challenges: schedule daily/weekly, pick or auto-fill questions, preview, publish.
  - Pages: markdown CMS for About, How to play, Privacy, Terms.
  - Users: search, role, ban.
  - Runs: flagged runs review (see anti-cheat).
- **Done when:** an admin can create a thematic weekly challenge from a phone in
  under 5 minutes and it shows up on everyone's Home.

### Phase 4 — Friends, leaderboards, badges

- **Friends:** mutual friendships (request → accept), found by handle, by invite link,
  or by QR. "Challenge a friend" creates a private `friend` challenge with the same
  questions, sent as a link.
- **Leaderboards:** real data per challenge, a friends-only filter, and percentiles
  computed from real runs once N ≥ 50. Until then keep the current synthetic model,
  labelled as such.
- **Badges:** rule-based (jsonb rules evaluated by an Edge Function after each run).
  The first set:
  - First run.
  - 3/7/30-day streak.
  - Perfect run (all correct).
  - Sub-5-minute 1k + all correct.
  - First thematic challenge.
  - Top 10% of a weekly challenge.
  - Answered in Zone 4+.
  - Beat a friend.
  - Quizrun finisher (Phase 5).
  - Badges are shown on profile and friend profiles.
- **Done when:** two test accounts can friend each other, run the same challenge,
  see each other ranked, and earn a badge.

### Phase 5 — Real Quizrun mode

This is the format of the actual Quizrun events: run a leg, then answer a block of
questions.

- **Format:** run **2.5 km** → the app stops you for **5 questions** → (repeat for
  multi-leg courses). The leg ends when GPS says ≥ 2.5 km **or** when the runner
  taps **"I've done 2.5 km"**. The manual option exists because GPS is weak under
  trees and between buildings, and people's watches disagree.
- **Logging:** run time and think time are recorded separately (the Quizrun
  `run_times` / `think_times` model). Score = total time − 2:30 per correct answer,
  so the leaderboard is comparable with Quizrun events.
- **Honesty:** store GPS distance, manual-confirm flag, and GPS quality per leg.
  Manual confirmations under ~2.2 km GPS distance, or impossible paces, are marked
  `gps_quality = 'manual'`. They get a "GPS-unverified" tag on leaderboards and are
  excluded from prize/weekly ranks unless an admin approves them.
- **Event link (Quizrun Pro bridge):** an optional event code joins a Quizrun event,
  and results are exported in Quizrun's results format.
- **Done when:** a real 2.5 km outdoor test logs one leg + 5 answers with both times,
  and a manual-confirm run is visibly flagged.

### Phase 6 — Hardening and launch

- **API protection:** `/api/tts`, `/api/stt` and `/api/judge` require a Supabase JWT.
  Add a per-user rate limit (e.g. Upstash or a Postgres counter) and a hard monthly
  budget cap. Replace CORS `*` with an allowlist of the app origins plus the
  Capacitor scheme.
- **Privacy/GDPR:** GPS traces, heart rate and voice are personal (heart rate is
  health data).
  - Explicit consent screens.
  - Routes trimmed around start/finish (privacy zones).
  - Audio never stored.
  - Data export and account delete.
  - Privacy policy + terms pages (admin CMS).
- **Staging:** a Vercel preview per PR plus a staging Supabase project. Run
  `smoke:prod` against the preview with `SMOKE_URL`.
- **Observability:** error reporting (Sentry), product analytics (PostHog or Plausible:
  signup → first run → day-7 retention), and an uptime check on `/health`.
- **Android release:** a signed release build (keystore in repo secrets), versioned
  from tags, then Play Store internal testing.
- **iOS:** Web Bluetooth does not exist in iOS Safari. HR on iOS needs the Capacitor
  BLE plugin in a native shell, so treat iOS as post-MVP.
- **Content:** ≥ 500 live questions across categories before public launch, so a daily
  user does not see repeats for months.
- **Done when:** a non-team tester installs from Play internal testing, registers, and
  completes a daily challenge and a Quizrun-mode run, with no help.

## 7. Gaps in the brief, with the default I'd pick

| Gap | Recommended default |
| --- | --- |
| Stack: keep vanilla JS or align with Quizrun? | Align (React/TS/Supabase), porting incrementally behind the e2e test. |
| Same or separate Supabase project from Quizrun? | Separate now, SSO/merge when Quizrun Pro happens. |
| Daily or weekly challenges? | Both: daily (auto) for habit, weekly (curated) for competition. |
| Friends: mutual or follow? | Mutual; it fits "compete with friends" and simplifies privacy. |
| Who sees my runs/routes? | Friends by default; routes trimmed near home. |
| How is a 2.5 km leg trusted? | GPS or manual confirm; manual is flagged, not blocked. |
| Where do questions come from at scale? | Admin CSV import + LLM-drafted, human-approved; licensing check per thematic source. |
| Scoring across modes | Solo keeps points; Quizrun mode uses time − 2:30 per correct; never mixed on one leaderboard. |
| Anti-cheat | Server recomputes scores, timing sanity checks, flagged-run review in admin. |
| Notifications | Post-MVP: email digest first; push via Capacitor later. |
| Offline | Queue finished runs locally; questions bundled per run before start. |
| API abuse / cost | JWT + rate limit + budget cap (Phase 6, but before public launch). |
| Accessibility | Every voice action has a tap/typing alternative (already true; keep it). |
| Naming | Keep "CogniRun" for the app; "Quizrun Pro" for events + app bundle once both are live. |

## 8. Known issues found during the analysis

- `selectRunQuestions` always picks the first question of each category, so every
  run is identical (fix in Phase 1).
- `/api/tts`, `/api/stt` and `/api/judge` are unauthenticated (Phase 6).
- At high demo multipliers the live screen used to stall the browser (fixed in
  Phase 0 by painting once per frame).
- `/questions` 404s under `vite preview`. The app falls back to the bundled library,
  which is fine, but it logs a warning.
- The README described an older build (demo on by default, browser-only voice).
  *(Updated in Phase 0.)*
