# Account and sync memo

## Today's behaviour

- Without `VITE_SUPABASE_*` the app is local-only: no Supabase import, runs stay in `localStorage` (max 500).
- Account screen: tick the terms box, then "Continue with Google" or "Email me a link" (magic link, sign-up on first use). There is no password sign-in.
- Web: the link comes back to the same page, supabase-js swaps `?code=` for a session (PKCE), the app strips the params and opens `#/account`.
- Android: links go to `com.cognirun.app://auth-callback`; the app swaps the code, closes the Custom Tab, stays on the current screen.
- After sign-in the ticked terms version is recorded (`accept_terms`), the profile loads, and every unsynced run on the device is uploaded, including runs from before sign-in.
- Finishing a run saves it on the device (`synced: false`) and uploads it in the background; history merges device and account runs.
- Users on old terms see "Accept the updated terms above"; nothing uploads until they accept.
- Sign out: synced runs are wiped from the device, unsynced ones stay. Starting offline with an expired session counts as "offline", not as signed out.
- Delete account: the server deletes the user (cascades to profile, runs, answers), then the device signs out locally.

## Facts checked against code

| Claim | Evidence (file:line) | Verdict |
|---|---|---|
| Brief: sign-in by "email magic link / password / Google" | session.js:214-216 `signInWithOtp`, :228 `signInWithOAuth`; no `password` in web/src | wrong (no password) |
| SUPABASE.md:4 magic link or Google | session.js:214, :228 | confirmed |
| SUPABASE.md:46-49 save is local first, then upload, failures do not block others | syncedStore.js:221-224, :165-169 | confirmed |
| SUPABASE.md:50-51 sign-in uploads every unsynced run on the device | syncedStore.js:79-84, :163 (no owner filter) | confirmed, and it is bug 1 |
| SUPABASE.md:52-53 list merges, device copy wins, falls back offline | syncedStore.js:208-214, :125-136 | confirmed |
| SUPABASE.md:54-56 sign-out removes synced runs, keeps unsynced and mid-upload ones | syncedStore.js:106-111, :93-97, :172 | confirmed (but see bugs 1-2) |
| SUPABASE.md:56-59 offline start is not a sign-out, reconnects when online | session.js:157-169, syncedStore.js:79-84, :110; supabase.js:43 `autoRefreshToken` | confirmed: the `online` handler restores the session → attach → sync; supabase-js' refresh also retries |
| SUPABASE.md:23 run id is the PK, uploads are idempotent upserts | migration 20261029000000 :104, remoteStore.js:128 | confirmed; the PK is global, so it is idempotent only within one owner (bug 2) |
| SUPABASE.md:23 runs are own-rows only | migration :174-193 | confirmed |
| SUPABASE.md:93 add the Render URL to redirects | refactoring-plan.md:136 | stale (already listed) |
| SUPABASE.md:185-188 `singleTask`, `appUrlOpen` or `getLaunchUrl()` on cold start | AndroidManifest.xml:17, :30; session.js:134-139 | confirmed |
| SUPABASE.md:194 PKCE ties a link to the requesting browser | session.js:177-178 (web hint); native shows the raw error (:124) | confirmed |
| Sign-out hint "removes synced runs from this device" | account.js:110, syncedStore.js:110 | confirmed (separately, sign-out is global: bug 5) |
| Settings "N runs saved on this device", "Delete every run saved on this device" | settings.js:36, :70-71 use merged `store.list()` and syncing `store.remove()` | wrong (bug 4) |
| MVP-PLAN: runs are queued offline | syncedStore.js:221-224 queue; `sync()` called only at :84, :104, :201 (self-call), :223, account.js "Sync now" | confirmed queue; no upload when an attached session's connection returns (bug 6) |
| MVP-PLAN: deleting the account removes synced runs from the device | session.js:287-289 → syncedStore.js:110 | confirmed; unsynced runs stay (bug 1) |
| `config.toml` allows the native redirect locally | supabase/config.toml:168 | confirmed |
| Run ids are random UUIDs | runRecord.js:43-45 | partly: `crypto.randomUUID()`, else `run-<Date.now>-<Math.random>` |

## Bugs

1. **A signed-out user's unsynced runs go into the next account.** Symptom: on a shared phone, A's run (route, heart rate) that had not uploaded yet appears in B's history and B's account after B signs in. Cause: local runs have no owner; `attach()` → `sync()` uploads every `!synced` run (syncedStore.js:79-84, :163); sign-out only purges synced runs (:93-97, :110); delete-account behaves the same (session.js:287-289). Runs made while signed out (or legacy unsynced runs) are ownerless and leak the same way. sync-store.test.mjs:316-318 only asserts the run stays `synced: false`; the cross-user upload was verified with a node script on the repo's fake Supabase: B's list `['a-run']`, server row `a-run@B`. Severity: **medium** (privacy leak, needs a shared device and a pending upload).
2. **A run mid-upload at sign-out sticks in the next account as a permanent error.** Symptom: B sees A's run in history and "Sync now" always fails with "new row violates row-level security policy". Cause: the upload to A succeeds, then `if (remote !== current) return;` (syncedStore.js:172) leaves it `synced: false`; B's upsert of the same `id` (global PK, migration :104) hits the `runs: update own` policy (:184-188). Verified with a node script: server `inflight@A`, B status `error … row-level security`, B list `['inflight']`. Severity: **medium**.
3. **The sync loop spins forever in the needs-consent state (tab hangs).** Symptom: a user on old terms finishes a run while the first sync after load or sign-in is still waiting for `termsAccepted()`; the page freezes. Cause: the second `sync()` sets `rerun = true` (syncedStore.js:145); the needs-consent branch returns early (:153-155) without clearing `rerun`; `.then` calls `sync()` again (:201), forever. Verified with a node script: 200k `termsAccepted` calls and 400k notifications before my cap; a 25 ms timer never fired before the cap (microtask starvation). Severity: **medium** (rare trigger, total hang).
4. **Settings "Delete all runs" deletes the account's runs.** Same as settings-legal-and-nav.md bug 1; fix once. Symptom: the dialog says "on this device", but the count includes account runs and confirming deletes the account copy and this device's copy (other devices' local copies stay). Cause: settings.js:36, :49, :71 use the merged `store.list()` and `store.remove()`, which also deletes remotely (syncedStore.js:226-230). Verified by reading. Severity: **high**.
5. **Sign out signs out all devices.** Symptom: signing out on the phone revokes every device's refresh token; the web session lasts until its access token expires, then it is signed out and wipes its synced runs. Cause: session.js:246 `client.auth.signOut()` uses auth-js's default `scope: 'global'` (GoTrueClient.ts:4036-4052); delete-account already passes `scope: 'local'` (session.js:287). Verified by reading the library source. Severity: **low**.
6. **Runs finished during an outage after the session was attached do not upload when the connection returns.** Symptom: the "N unsynced" count stays until the next run or "Sync now". Cause: no `online` listener in syncedStore; `sync()` is only called at :84, :104, :201, :223 and from "Sync now". The offline-start case works: session.js:157-169 restores the session on `online`, and attach() runs sync (syncedStore.js:79-84). supabase-js' auto-refresh (supabase.js:43) keeps retrying the token but, for the same user, does not trigger a sync. Verified by grep and reading. Severity: **low**.
7. **A run deleted offline while signed in comes back.** Cause: `remove()` deletes locally first, then only records the remote error (syncedStore.js:227-233); the next online `list()` brings the account copy back. Verified by reading. Severity: **low**.
8. **A failed profile load shows "Accept the updated terms above" with no terms card.** Cause: `termsAccepted()` returns false when `profile` is null (session.js:275) → needs-consent (syncedStore.js:154, account.js:22); the card needs a profile (account.js:60, legal.js:15-16). Verified by reading. Severity: **low**.

### Suspicions (not verified)

- Switching accounts without a signed-out event (B's link opened while A is signed in): `attach()` does not purge A's synced runs. My script showed B listing A's synced run at the store level, but I found no real auth path that emits SIGNED_IN for B without SIGNED_OUT (PKCE verifier is overwritten by each request).
- `android:allowBackup="true"` (AndroidManifest.xml:5) may back up WebView storage with tokens and routes.
- Server reachable-but-down while the device is online: no `online` event, so recovery depends on supabase-js' refresh ticker.
- `getLaunchUrl()` may return the same stale `?code=` after a WebView reload (session.js:138-139) and show an error.
- `LOCAL_RUNS_LIMIT` (store.js:23) may drop the oldest runs even if unsynced.
- Consent is only enforced client-side; `runs: insert own` (migration :179-182) does not check `terms_version`.

## Proposal

1. Collapse `sync()` to one pass: delete `MAX_SYNC_PASSES`, the inner `do/while` and the `JSON.stringify` re-save check (the only production `save()` makes a new id, main.js:174); clear `rerun` at the start of `run()`. Fixes bug 3. **No answer needed.**
2. Stamp the owner and upload only owned runs: `save()` adds `userId` when signed in; `sync()` uploads only runs whose `userId` is the current user, never ownerless ones (filter at syncedStore.js:163); sign-out and delete-account (`forgetSyncedRuns`, :93-97) also drop that user's unsynced runs. Ownerless runs (made signed out, or legacy) stay device-only. Update sync-store.test.mjs:316-318, the syncedStore header, the sign-out hint (account.js:110) and SUPABASE.md:50-51. Fixes bugs 1 and 2. **Needs answer: Q1.**
3. Pass `{ scope: 'local' }` in `signOut()` (session.js:246). Fixes bug 5. **Needs answer: Q2.**
4. Settings "Delete all runs": count and delete the device store only. Fixes bug 4; same fix as settings-legal-and-nav.md proposal 1, do it once. **Needs answer: Q3.**
5. In syncedStore, `window.addEventListener('online', () => void sync())` when a window exists. Fixes bug 6. **No answer needed.**
6. `remove()`: when signed in, delete in the account first; on failure keep the local copy and show the error. Fixes bug 7. **No answer needed.**
7. `termsAccepted()` throws when the profile could not be loaded, so sync shows an error instead of needs-consent. Fixes bug 8. **No answer needed.**
8. Delete the items below and adapt their tests. **Needs answer: Q5** (only for `get()`).
9. SUPABASE.md "How the app syncs": owner rule, local sign-out, reconnect upload; drop the Render line with plan Q1. **Needs answer: Q1, Q2.**

## What to delete

Searches: `isSupabaseConfigured|handleNativeUrl` across web/src, web/test, api, functions, docs, android/app/src; `(store|remote)\.get\(` across web/src and web/test.

- `isSupabaseConfigured` (supabase.js:18): no other hit outside supabase-auth.test.mjs:4, :57-58.
- Public `auth.handleNativeUrl` (session.js:314): only supabase-auth.test.mjs:280, :282 call it; no hit in android/. The test can fire `capacitor.listeners.appUrlOpen` as it already does at :254-255. The internal function (session.js:115) stays.
- Synced `store.get()` with its remote fallback (syncedStore.js:216-220) and `remoteStore.get` (remoteStore.js:124-127): the only web/src hit is the fallback itself (syncedStore.js:219); otherwise only tests (sync-store.test.mjs:98-104, :131, :197). Also remove `get(id)` from the RunStore contract (store.js:5-10), which createSyncedRunStore's return type claims. `local.get` stays as an internal method of the local store: production caller syncedStore.js:173 (gone once proposal 1 drops the re-save check), tests history.test.mjs:113-116.
- Re-save handling in `sync()` (syncedStore.js:30, :158-182): the only `store.save` call is main.js:174 with a fresh record; no test covers a re-save (test names in sync-store.test.mjs:52-352).

## Questions

1. Which runs upload, and what happens to a user's unsynced runs at sign-out or account deletion? **Default:** upload only runs stamped with the signed-in user; never auto-upload ownerless runs (made signed out, or legacy), they stay device-only; delete the leaving user's unsynced runs at sign-out and account deletion. Reason: simplest rule that closes the leak, and there are no live users to lose data. Alternatives: keep the leaving user's unsynced runs hidden and upload them on their next sign-in; offer ownerless runs once with "Add N runs from this device to your account?".
2. Should sign-out be device-only? **Default:** yes, `scope: 'local'`. Reason: the default global scope revokes refresh tokens on every device (their access tokens stay valid until expiry, then they sign out and purge synced runs); a sign-out button should end this device only, and delete-account already uses `local`.
3. Should "Delete all runs" in Settings touch the account? **Default:** no, device only; the account keeps per-run delete and account deletion. Reason: matches the dialog text.
4. Should consent be enforced in RLS too? **Default:** no. Reason: no live users, and the client gate plus `accept_terms` is enough for now.
5. Drop `store.get()` and `remoteStore.get()`? **Default:** yes. Reason: no production caller.
6. Set `android:allowBackup="false"` (Android memo)? **Default:** yes. Reason: backups would hold auth tokens and GPS routes; cost is losing local runs on reinstall.
