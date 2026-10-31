import { escapeHtml } from '../format.js';
import { DISPLAY_NAME_MAX } from '../auth/session.js';
import { needsTermsAcceptance } from '../legal.js';
import { legalLinksMarkup } from './legal.js';

/**
 * Account ('You') screen: sign-in / sign-out, display name, sync status and
 * the runs still waiting to upload. Works local-only when sign-in is not
 * configured in this build.
 */

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function messages(auth) {
  return `${auth.error ? `<p class="account-error" role="alert">${escapeHtml(auth.error)}</p>` : ''}${
    auth.notice ? `<p class="account-notice" role="status">${escapeHtml(auth.notice)}</p>` : ''
  }`;
}

function syncLine(sync) {
  if (sync.state === 'syncing') return 'Syncing…';
  if (sync.state === 'needs-consent') return 'Accept the updated terms above to upload your runs. They are safe on this device.';
  if (sync.state === 'error') return `Sync failed: ${sync.error ?? 'unknown error'}. Your runs are safe on this device.`;
  if (sync.unsynced > 0) return `${plural(sync.unsynced, 'run')} waiting to upload.`;
  return 'All runs are saved to your account.';
}

function consentMarkup(consent) {
  return `<label class="account-consent">
          <input type="checkbox" id="accept-terms" ${consent ? 'checked' : ''} />
          <span>I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy notice</a>, and to my runs (including GPS route and, if I connect a watch, heart rate) being stored with my account.</span>
        </label>`;
}

function signedOutMarkup(auth, sync, draft, consent) {
  const offline = auth.offline
    ? `<p class="account-notice" id="account-offline" role="status">You seem to be offline, so your account could not be checked. Your runs stay on this device; we'll reconnect when you're back online.</p>`
    : '';
  return `${offline}
      <p class="lede">Sign in to keep your runs in your account, see your progress on any device and join challenge leaderboards.</p>
      <section class="card account-signin">
        ${consentMarkup(consent)}
        <button class="primary" id="google-signin" type="button" ${consent ? '' : 'disabled'}>Continue with Google</button>
        <form id="email-form" class="account-form">
          <label for="email">Or get a sign-in link by email</label>
          <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required
            placeholder="you@example.com" value="${escapeHtml(draft.email ?? '')}" />
          <button type="submit" id="email-signin" ${consent ? '' : 'disabled'}>Email me a link</button>
        </form>
        ${messages(auth)}
      </section>
      <p class="hint" id="unsynced-count">${
        sync.unsynced > 0
          ? `${plural(sync.unsynced, 'run')} on this device will be added to your account when you sign in.`
          : 'Runs you finish are saved on this device until you sign in.'
      }</p>`;
}

function termsCardMarkup(profile) {
  if (!needsTermsAcceptance(profile)) return '';
  return `
      <section class="card account-terms" id="terms-card">
        <h2>Updated terms</h2>
        <p>${profile.terms_version ? 'Our Terms and Privacy notice have changed.' : 'Please review our Terms and Privacy notice.'} We store your runs, including GPS route and heart rate if you connect a watch, with your account only once you agree.</p>
        ${legalLinksMarkup()}
        <button class="primary" type="button" id="accept-terms-now">I agree</button>
      </section>`;
}

function deleteMarkup(confirming) {
  return `
      <section class="card account-danger">
        <h2>Delete account</h2>
        <p class="hint">Permanently deletes your account, profile, every synced run and your leaderboard results. Export your runs in Settings first if you want a copy.</p>
        ${
          confirming
            ? `<p class="account-error" role="alert">This cannot be undone.</p>
        <div class="row">
          <button type="button" class="danger" id="confirm-delete">Delete everything</button>
          <button type="button" id="cancel-delete">Cancel</button>
        </div>`
            : '<button type="button" class="danger" id="delete-account">Delete account…</button>'
        }
      </section>`;
}

function signedInMarkup(auth, sync, draft) {
  const name = draft.displayName ?? auth.profile?.display_name ?? '';
  return `${termsCardMarkup(auth.profile)}
      <section class="card account-profile">
        <p class="account-who">Signed in as <strong>${escapeHtml(auth.user?.email ?? 'your account')}</strong></p>
        <form id="name-form" class="account-form">
          <label for="display-name">Display name</label>
          <input id="display-name" name="displayName" type="text" maxlength="${DISPLAY_NAME_MAX}" required
            autocomplete="nickname" value="${escapeHtml(name)}" />
          <button type="submit" id="save-name">Save</button>
        </form>
        <p class="hint">Shown on challenge leaderboards.</p>
        ${messages(auth)}
      </section>
      <section class="card account-sync" data-sync-state="${escapeHtml(sync.state)}">
        <h2>Sync</h2>
        <p id="sync-status">${escapeHtml(syncLine(sync))}</p>
        <p class="hint" id="unsynced-count">${plural(sync.unsynced, 'unsynced run')}${
          sync.lastSyncedAt ? ` · last synced ${escapeHtml(new Date(sync.lastSyncedAt).toLocaleTimeString())}` : ''
        }</p>
        <button type="button" id="sync-now" ${sync.state === 'syncing' ? 'disabled' : ''}>Sync now</button>
      </section>
      <button type="button" id="sign-out" class="account-signout">Sign out</button>
      <p class="hint">Signing out removes synced runs from this device. They stay in your account.</p>
      ${deleteMarkup(draft.confirmDelete)}`;
}

/**
 * @param {object} input
 * @param {import('../auth/session.js').AuthState} input.auth
 * @param {import('../history/syncedStore.js').SyncStatus} input.sync
 * @param {{email?: string, displayName?: string, confirmDelete?: boolean}} [input.draft]  what the user is typing
 * @param {boolean} [input.consent]  terms ticked on the sign-in screen
 */
export function accountMarkup({ auth, sync, draft = {}, consent = false }) {
  let body;
  if (auth.status === 'unconfigured') {
    body = `
      <section class="card account-local">
        <p class="lede">Sign-in is not configured in this build, so your runs are saved on this device only.</p>
        <p class="hint" id="unsynced-count">${plural(sync.unsynced, 'run')} on this device.</p>
      </section>`;
  } else if (auth.status === 'loading') {
    body = '<p class="lede">Checking your account…</p>';
  } else if (auth.status === 'signed-in') {
    body = signedInMarkup(auth, sync, draft);
  } else {
    body = signedOutMarkup(auth, sync, draft, consent);
  }
  return `
    <main class="screen account" data-screen="account">
      <h1>You</h1>
      ${body}
      ${legalLinksMarkup()}
    </main>`;
}

const LOCAL_STATUS = { state: 'local-only', unsynced: 0, lastSyncedAt: null, error: null };
let stopPrevious = () => {};

export function renderAccount(root, { auth, store }) {
  stopPrevious();
  const draft = {};
  const syncStatus = () => store.syncStatus?.() ?? LOCAL_STATUS;
  let unsubscribe = [];
  const stop = () => {
    unsubscribe.forEach((off) => off());
    unsubscribe = [];
  };
  stopPrevious = stop;

  function draw() {
    const focused = document.activeElement?.id;
    root.innerHTML = accountMarkup({
      auth: auth.state(),
      sync: syncStatus(),
      draft,
      consent: auth.hasPendingTerms?.() ?? false,
    });
    if (focused) root.querySelector(`#${focused}`)?.focus();
    wire();
  }

  function redraw() {
    // Another tab took over #app: stop listening.
    if (!root.querySelector('[data-screen="account"]')) return stop();
    draw();
  }

  function wire() {
    const email = root.querySelector('#email');
    email?.addEventListener('input', () => (draft.email = email.value));
    const consented = () => auth.hasPendingTerms?.() ?? true;
    root.querySelector('#email-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (consented()) void auth.signInWithEmail(email.value);
    });
    root.querySelector('#google-signin')?.addEventListener('click', () => {
      if (consented()) void auth.signInWithGoogle();
    });

    const name = root.querySelector('#display-name');
    name?.addEventListener('input', () => (draft.displayName = name.value));
    root.querySelector('#name-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (await auth.updateDisplayName(name.value)) delete draft.displayName;
    });
    root.querySelector('#sync-now')?.addEventListener('click', () => void store.sync?.());
    root.querySelector('#sign-out')?.addEventListener('click', () => void auth.signOut());

    root.querySelector('#accept-terms')?.addEventListener('change', (event) => {
      auth.setPendingTerms(event.target.checked);
      draw();
    });
    root.querySelector('#accept-terms-now')?.addEventListener('click', () => void auth.acceptTerms());
    const confirmDelete = (on) => {
      draft.confirmDelete = on;
      draw();
    };
    root.querySelector('#delete-account')?.addEventListener('click', () => confirmDelete(true));
    root.querySelector('#cancel-delete')?.addEventListener('click', () => confirmDelete(false));
    root.querySelector('#confirm-delete')?.addEventListener('click', async (event) => {
      event.target.disabled = true;
      if (await auth.deleteAccount()) delete draft.confirmDelete;
      else event.target.disabled = false;
    });
  }

  draw();
  unsubscribe = [auth.subscribe(redraw), store.subscribe(redraw)];
}
