import { CALIBRATION_CONDITIONS } from './calibration.js';

/**
 * Progression through the calibration protocol: which condition the runner is on,
 * whether they are resting before it or holding it, and how much of it is left.
 *
 * Driven one simulated second at a time by whatever clock the caller owns, so the
 * demo can run it accelerated. No DOM, no timers, no sensors.
 */
export function createCalibrationSession({
  conditions = CALIBRATION_CONDITIONS,
  onUpdate = () => {},
  onCondition = () => {},
  onComplete = () => {},
} = {}) {
  let index = 0;
  let phase = conditions[0].restSec > 0 ? 'rest' : 'hold';
  let secondsIntoPhase = 0;
  let done = false;

  function phaseLength() {
    const condition = conditions[index];
    return phase === 'rest' ? condition.restSec : condition.holdSec;
  }

  function state() {
    const condition = done ? conditions[conditions.length - 1] : conditions[index];
    const remainingSec = done ? 0 : Math.max(0, phaseLength() - secondsIntoPhase);
    return {
      done,
      condition,
      index,
      total: conditions.length,
      phase: done ? 'done' : phase,
      remainingSec,
      elapsedSec: done ? 0 : secondsIntoPhase,
      completedIds: conditions.slice(0, done ? conditions.length : index).map((c) => c.id),
    };
  }

  function enter(nextIndex) {
    index = nextIndex;
    secondsIntoPhase = 0;
    phase = conditions[index].restSec > 0 ? 'rest' : 'hold';
    onCondition(state());
  }

  function complete() {
    done = true;
    secondsIntoPhase = 0;
    onUpdate(state());
    onComplete(state());
  }

  function advanceCondition() {
    if (done) return;
    if (index + 1 >= conditions.length) {
      complete();
      return;
    }
    enter(index + 1);
    onUpdate(state());
  }

  onCondition(state());
  onUpdate(state());

  return {
    state,
    /** Advance the protocol by one simulated second. */
    tick() {
      if (done) return state();
      secondsIntoPhase += 1;
      if (secondsIntoPhase >= phaseLength()) {
        if (phase === 'rest') {
          phase = 'hold';
          secondsIntoPhase = 0;
          onUpdate(state());
        } else {
          advanceCondition();
        }
      } else {
        onUpdate(state());
      }
      return state();
    },
    /** Skip the rest of the current condition (demo convenience). */
    skip: advanceCondition,
    /** Abandon the protocol without walking the remaining conditions. */
    finish() {
      if (!done) complete();
    },
  };
}
