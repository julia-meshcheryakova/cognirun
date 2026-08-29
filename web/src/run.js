import { createClock } from './clock.js';
import { createDemoSensors } from './sensors/demo.js';
import { createRealSensors } from './sensors/real.js';

export const RUN_DISTANCE_METERS = 3000;
export const QUESTION_COUNT = 3;

const EARTH_RADIUS = 6_371_000;
const MAX_ACCURACY_METERS = 30;
const STALE_FIX_MS = 10_000; // no fix for this long: the last pace is meaningless
const SCRUB_MAX_SECONDS = 3600; // safety net so a scrub can never loop forever

function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/**
 * Turns a position/heart-rate stream into run metrics, emitting a milestone
 * every completed kilometer and finishing once the distance and all questions
 * are done.
 */
export function createRun({
  demo,
  multiplier,
  onUpdate,
  onKilometer,
  onFinish,
  onError,
  onHeartRateStatus,
  onGpsStatus,
  bluetooth,
  geolocation,
}) {
  const samples = [];
  let last = null;
  let firstT = null;
  let lastT = null;
  let distance = 0;
  let speed = 0;
  let heartRate = 0;
  let kmReached = 0;
  let answered = 0;
  let finished = false;
  let startedAtMs = null;
  let lastFixMs = null;

  function handlePosition(point) {
    // The clock runs on every fix, even ones rejected below for distance.
    if (firstT === null) firstT = point.t;
    lastT = point.t;

    if (point.accuracy > MAX_ACCURACY_METERS) {
      onGpsStatus?.({
        state: 'weak',
        message: `Weak GPS (±${Math.round(point.accuracy)} m) — skipping fixes until it sharpens.`,
      });
      return;
    }
    lastFixMs = Date.now(); // only usable fixes keep the shown pace alive
    if (last) {
      const meters = haversine(last, point);
      if (meters <= (point.accuracy ?? 0) / 2) return; // GPS jitter, not movement
      const seconds = (point.t - last.t) / 1000;
      if (seconds > 0) speed = speed ? speed * 0.7 + (meters / seconds) * 0.3 : meters / seconds;
      distance += meters;
    }
    last = point;
    samples.push({ ...point, distance, speed, heartRate });

    const km = Math.min(QUESTION_COUNT, Math.floor(distance / 1000));
    while (kmReached < km) {
      kmReached += 1;
      onKilometer(kmReached);
    }
    onUpdate(snapshot());
    maybeFinish();
  }

  function handleHeartRate(bpm) {
    heartRate = bpm;
    onUpdate(snapshot());
  }

  const sensors = demo
    ? createDemoSensors({ onPosition: handlePosition, onHeartRate: handleHeartRate })
    : createRealSensors({
        onPosition: handlePosition,
        onHeartRate: handleHeartRate,
        onError,
        onHeartRateStatus,
        onGpsStatus,
        bluetooth,
        ...(geolocation ? { geolocation } : {}),
      });

  // A real run ticks on the wall clock so time and pace stay honest between GPS
  // fixes; a demo run ticks the simulator instead.
  const clock = createClock({
    multiplier: demo ? multiplier : 1,
    onSecond: demo
      ? (simMs) => sensors.step(simMs)
      : () => {
          if (lastFixMs !== null && Date.now() - lastFixMs > STALE_FIX_MS) speed = 0;
          onUpdate(snapshot());
        },
  });

  function snapshot() {
    return {
      distance,
      speed,
      heartRate,
      elapsedSeconds: elapsedSeconds(),
      samples,
    };
  }

  function elapsedSeconds() {
    if (!demo) return startedAtMs === null ? 0 : (Date.now() - startedAtMs) / 1000;
    return firstT === null ? 0 : (lastT - firstT) / 1000;
  }

  function maybeFinish() {
    if (finished) return;
    if (distance >= RUN_DISTANCE_METERS && answered >= QUESTION_COUNT) {
      finished = true;
      stop();
      onFinish(snapshot());
    }
  }

  function stop() {
    clock.stop();
    sensors.stop?.();
  }

  return {
    sensors,
    start() {
      startedAtMs = Date.now();
      sensors.start?.();
      clock.start();
    },
    stop,
    snapshot,
    now: clock.now,
    answerNow: clock.answerNow,
    setMultiplier: clock.setMultiplier,
    setAnswering: clock.setAnswering,
    /**
     * Demo only: fast-forward to `meters` by replaying normal simulated seconds,
     * so distance, pace, samples and kilometer questions stay consistent. Only
     * moves forward, and stops at the first kilometer whose question opens (the
     * question freezes the run) — so no milestone is ever skipped.
     */
    scrubTo(meters) {
      if (!demo || finished) return;
      const target = Math.min(meters, RUN_DISTANCE_METERS);
      let guard = SCRUB_MAX_SECONDS;
      while (distance < target && !finished && !clock.answering() && guard-- > 0) {
        clock.advanceSecond();
      }
    },
    noteAnswered() {
      answered += 1;
      maybeFinish();
    },
  };
}
