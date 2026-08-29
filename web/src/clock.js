const REAL_TICK_MS = 20;

/**
 * The single simulated clock everything reads: kilometer detection, the beep and
 * the per-question countdown. While a question is open the run is FROZEN (no
 * distance advances) so the run can't overshoot 3km while waiting for an answer;
 * a separate real-time answer clock drives the question countdown so the 60s
 * window stays answerable at any multiplier.
 */
export function createClock({ multiplier = 1, onSecond = () => {}, onAnswerSecond = () => {} }) {
  let simMs = 0;
  let emittedMs = 0;
  let answerMs = 0;
  let emittedAnswerMs = 0;
  let runningRate = multiplier;
  let answering = false;
  let timer = null;

  function tick() {
    if (answering) {
      // Run frozen: advance only the real-time answer countdown, not distance.
      answerMs += REAL_TICK_MS;
      while (emittedAnswerMs + 1000 <= answerMs) {
        emittedAnswerMs += 1000;
        onAnswerSecond(answerMs);
      }
      return;
    }
    simMs += REAL_TICK_MS * runningRate;
    while (emittedMs + 1000 <= simMs) {
      emittedMs += 1000;
      onSecond(emittedMs);
    }
  }

  return {
    start() {
      if (!timer) timer = setInterval(tick, REAL_TICK_MS);
      timer.unref?.(); // don't hold a Node test process open
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    now: () => simMs,
    answerNow: () => answerMs,
    answering: () => answering,
    /** Emit one more simulated second right now (demo scrubbing fast-forward). */
    advanceSecond() {
      simMs = emittedMs + 1000;
      emittedMs = simMs;
      onSecond(simMs);
    },
    setMultiplier(value) {
      runningRate = value;
    },
    /** Freeze the run (distance) while answering; reset the answer countdown. */
    setAnswering(value) {
      answering = value;
      if (value) {
        answerMs = 0;
        emittedAnswerMs = 0;
      }
    },
  };
}
