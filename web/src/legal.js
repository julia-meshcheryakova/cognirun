/**
 * Legal constants. Bump TERMS_VERSION when the Terms or the Privacy notice
 * change in a way people must agree to again: signed-in users then see a
 * re-accept card on the You tab, and the version they accept is recorded on
 * their profile (profiles.terms_version, via the accept_terms RPC).
 */
export const TERMS_VERSION = '2026-10-31';
export const PRIVACY_VERSION = '2026-10-31';
export const LEGAL_UPDATED = '31 October 2026';
export const CONTACT_EMAIL = 'quizrun.org@gmail.com';

/** Pending acceptance ticked before sign-in, applied once the profile exists. */
export const PENDING_TERMS_KEY = 'cognirun.pendingTerms';

export function needsTermsAcceptance(profile) {
  return Boolean(profile) && profile.terms_version !== TERMS_VERSION;
}
