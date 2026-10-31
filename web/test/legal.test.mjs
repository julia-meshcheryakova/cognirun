import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTACT_EMAIL, TERMS_VERSION, needsTermsAcceptance } from '../src/legal.js';
import { LEGAL_PAGES, legalMarkup } from '../src/ui/legal.js';
import { navMarkup, parseRoute } from '../src/ui/nav.js';
import { settingsMarkup } from '../src/ui/settings.js';

test('privacy and terms are routable pages without a tab', () => {
  assert.deepEqual(LEGAL_PAGES, ['privacy', 'terms']);
  for (const page of LEGAL_PAGES) {
    assert.deepEqual(parseRoute(`#/${page}`), { tab: page, params: [] });
    assert.doesNotMatch(navMarkup(page), /aria-current/);
  }
});

test('the privacy notice covers what the app collects and who processes it', () => {
  const html = legalMarkup('privacy');
  assert.match(html, /data-screen="privacy"/);
  for (const topic of [/GPS route/, /heart rate/i, /Art\. 9/, /ElevenLabs/, /Groq/, /Supabase/, /Delete|delete your account/, /16/, /ico\.org\.uk/]) {
    assert.match(html, topic);
  }
  assert.match(html, new RegExp(`mailto:${CONTACT_EMAIL}`));
});

test('the terms cover safety, fair play and the law', () => {
  const html = legalMarkup('terms');
  assert.match(html, /data-screen="terms"/);
  for (const topic of [/injury/, /traffic/, /not a medical device/, /Fair play/, /England and Wales/, /href="#\/privacy"/]) {
    assert.match(html, topic);
  }
});

test('settings links to the legal pages', () => {
  const html = settingsMarkup({ settings: { voice: true, course: '3k' } });
  assert.match(html, /href="#\/privacy"[\s\S]*href="#\/terms"/);
});

test('a profile needs to accept unless it holds the current version', () => {
  assert.equal(needsTermsAcceptance(null), false, 'no profile loaded yet: nothing to ask');
  assert.equal(needsTermsAcceptance({ terms_version: null }), true);
  assert.equal(needsTermsAcceptance({ terms_version: '2000-01-01' }), true);
  assert.equal(needsTermsAcceptance({ terms_version: TERMS_VERSION }), false);
});