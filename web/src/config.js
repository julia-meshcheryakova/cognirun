export const MULTIPLIERS = [1, 10, 100, 1000];

/** Where the question server lives; falls back to the bundled library if it is down. */
export const QUESTION_SERVER_URL =
  import.meta.env?.VITE_QUESTION_SERVER_URL ?? 'http://localhost:4000';
