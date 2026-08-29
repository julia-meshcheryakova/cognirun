import { CALIBRATION_CONDITIONS } from './calibration.js';

/**
 * Progression through the calibration protocol: which stage the runner is on,
 * whether they are resting before it or holding it, how much of it is left, and
 * the synthetic heart rate the stage settles at when no watch is connected.
 *
 * Driven one simulated second at a time by whatever clock the caller owns, so the
 * demo speed accelerates it. No DOM, no timers, no sensors.
 */
export function createCalibrationSession({
  conditions = CALIBRATION_CONDITIONS,
  onUpdate = () => {},
  onStage = () => {},
  onComplete = () => {},
} = {}) {
  let index = 0;
  let phase = conditions[0].restSec > 0 ? 'rest' : 'hold';
  let secondsIntoPhase = 0;
  let bpm = conditions[0].demoBpm;
  let done = false;

  function phaseLength() {
    const condition = conditions[index];
    return phase === 'rest' ? condition.restSec : condition.holdSec;
  }

  function state() {
    return {
      done,
      condition: conditions[index],
      index,
      total: conditions.length,
      phase: done ? 'done' : phase,
      remainingSec: done ? 0 : Math.max(0, phaseLength() - secondsIntoPhase),
      elapsedSec: done ? 0 : secondsIntoPhase,
      demoBpm: Math.round(bpm),
      completedIds: conditions.slice(0, done ? conditions.length : index).map((c) => c.id),
    };
  }

  function complete() {
    done = true;
    secondsIntoPhase = 0;
    index = conditions.length - 1;
    onUpdate(state());
    onComplete(state());
  }

  function advanceStage() {
    if (done) return;
    if (index + 1 >= conditions.length) {
      complete();
      return;
    }
    index += 1;
    secondsIntoPhase = 0;
    phase = conditions[index].restSec > 0 ? 'rest' : 'hold';
    onStage(state());
    onUpdate(state());
  }

  onStage(state());
  onUpdate(state());

  return {
    state,
    /** Advance the protocol by one simulated second. */
    tick() {
      if (done) return state();
      // Heart rate eases towards whatever the current stage asks for, so the
      // no-key demo shows a plausible response instead of a step change.
      bpm += (conditions[index].demoBpm - bpm) * 0.1;
      secondsIntoPhase += 1;
      if (secondsIntoPhase >= phaseLength()) {
        if (phase === 'rest') {
          phase = 'hold';
          secondsIntoPhase = 0;
          onUpdate(state());
        } else {
          advanceStage();
        }
      } else {
        onUpdate(state());
      }
      return state();
    },
    /** Skip the rest of the current stage; finishes the protocol on the last one. */
    skip: advanceStage,
    /** End the protocol now, without walking the remaining stages. */
    finish() {
      if (!done) complete();
    },
  };
}
