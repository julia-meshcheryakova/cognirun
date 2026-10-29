export const MULTIPLIERS = [1, 10, 100, 1000];

/**
 * Live-run courses. Question count is total/segment: one question per kilometre
 * on the real distances (3, 5, 10). The 300 m and 60 m courses are walkable
 * test courses, so a full run can be finished on foot.
 */
export const COURSES = {
  '3k': { label: '3K', segment: 1000, total: 3000 },
  '5k': { label: '5K', segment: 1000, total: 5000 },
  '10k': { label: '10K', segment: 1000, total: 10000 },
  '300m': { label: '300 m', segment: 100, total: 300 },
  '60m': { label: '60 m', segment: 20, total: 60 },
};
export const DEFAULT_COURSE = '3k';
export const courseOf = (id) => COURSES[id] ?? COURSES[DEFAULT_COURSE];
export const questionCountOf = (id) => {
  const course = courseOf(id);
  return Math.round(course.total / course.segment);
};

/** The lengths a weekly challenge is offered in. */
export const CHALLENGE_COURSES = ['3k', '5k', '10k'];

/**
 * Where the question server lives; falls back to the bundled library if it is down.
 *
 * Native (Capacitor) serves the app from capacitor://localhost, so a same-origin
 * '' would resolve /api/* against the WebView itself and every voice call would
 * fail silently. Native must therefore point at the deployed server.
 */
const DEPLOYED_SERVER = 'https://cognirun.vercel.app';

function defaultServerUrl() {
  const isNative =
    typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  if (isNative) return DEPLOYED_SERVER;
  // Deployed web build talks to its own /api routes; dev talks to the local server.
  return import.meta.env?.PROD ? '' : 'http://localhost:4000';
}

export const QUESTION_SERVER_URL =
  import.meta.env?.VITE_QUESTION_SERVER_URL ?? defaultServerUrl();

/**
 * Server-side LLM judge (POST { questionId, text }). The Groq key stays on the
 * server. Node has no import.meta.env, so the headless tests never call it.
 */
export const JUDGE_URL =
  import.meta.env?.VITE_JUDGE_URL ?? (import.meta.env ? `${QUESTION_SERVER_URL}/api/judge` : '');
