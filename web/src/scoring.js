export const ANSWER_WINDOW_SECONDS = 60;

/** 100 points at 0s decaying linearly to 50 points at 60s; 0 after the window. */
export function scoreForElapsed(elapsedSeconds) {
  if (elapsedSeconds > ANSWER_WINDOW_SECONDS) return 0;
  const score = 100 - (elapsedSeconds / ANSWER_WINDOW_SECONDS) * 50;
  return Math.round(Math.max(50, score));
}
