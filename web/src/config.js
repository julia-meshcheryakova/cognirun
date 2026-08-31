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

/** Where the question server lives; falls back to the bundled library if it is down. */
// Empty string = same origin, so the deployed build hits its own /api routes.
export const QUESTION_SERVER_URL =
  import.meta.env?.VITE_QUESTION_SERVER_URL ??
  (import.meta.env?.PROD ? '' : 'http://localhost:4000');
