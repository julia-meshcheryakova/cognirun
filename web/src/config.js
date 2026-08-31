export const MULTIPLIERS = [1, 10, 100, 1000];

/**
 * Live-run courses. Question count is always total/segment (3 either way); the
 * 60 m course is a walkable test/demo so a full run can be finished on foot.
 */
export const COURSES = {
  '3k': { label: '3K', segment: 1000, total: 3000 },
  '300m': { label: '300 m', segment: 100, total: 300 },
  '60m': { label: '60 m', segment: 20, total: 60 },
};
export const DEFAULT_COURSE = '3k';
export const courseOf = (id) => COURSES[id] ?? COURSES[DEFAULT_COURSE];

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
