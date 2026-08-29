export const MULTIPLIERS = [1, 10, 100, 1000];

/**
 * Live-run courses. Question count is always total/segment (3 either way); the
 * 60 m course is a walkable test/demo so a full run can be finished on foot.
 */
export const COURSES = {
  '3k': { label: '3K', segment: 1000, total: 3000 },
  '60m': { label: '60 m', segment: 20, total: 60 },
};
export const DEFAULT_COURSE = '3k';
export const courseOf = (id) => COURSES[id] ?? COURSES[DEFAULT_COURSE];

/** Where the question server lives; falls back to the bundled library if it is down. */
export const QUESTION_SERVER_URL =
  import.meta.env?.VITE_QUESTION_SERVER_URL ?? 'http://localhost:4000';
