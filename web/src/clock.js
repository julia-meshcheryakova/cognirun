const REAL_TICK_MS = 20;

/**
 * The single simulated clock everything reads: kilometer detection, the beep and
 * the per-question countdown, so nothing desyncs at high multipliers. The
 * multiplier only scales running time — while a question is open the clock runs
 * at real-time rate so the 60 second answer window stays answerable.
 */
export function createClock({ multiplier = 1, onSecond = () => {} }) {
  let simMs = 0;
  let emittedMs = 0;
  let rate = multiplier;
  let runningRate = multiplier;
  let answering = false;
  let timer = null;

  function tick() {
    simMs += REAL_TICK_MS * rate;
    while (emittedMs + 1000 <= simMs) {
      emittedMs += 1000;
      onSecond(emittedMs);
    }
  }

  return {
    start() {
      if (!timer) timer = setInterval(tick, REAL_TICK_MS);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    now: () => simMs,
    setMultiplier(value) {
      runningRate = value;
      if (!answering) rate = value;
    },
    /** Real-time rate while answering, multiplier rate while running. */
    setAnswering(value) {
      answering = value;
      rate = value ? 1 : runningRate;
    },
  };
}
