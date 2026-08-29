/**
 * The calibration protocol: the fixed sequence of conditions a runner holds so we
 * can learn their heart rate response before scoring a run.
 *
 * Pure data plus lookup helpers — no UI, sensors, timers or scoring here.
 */
import { MAX_HR } from './hrZones.js';

/** Heart rate the demo simulator holds a condition at, as a share of `MAX_HR`. */
const demoBpm = (share) => Math.round(share * MAX_HR);

/**
 * Asked in this order. `holdSec` is how long the condition is held; `restSec` is
 * the idle gap between the end of the previous condition and this one, so the
 * recovery samples land at their intended distance from the end of the effort.
 */
export const CALIBRATION_CONDITIONS = [
  {
    id: 'seated',
    label: 'Seated',
    instruction: 'Sit still and breathe normally.',
    holdSec: 60,
    restSec: 0,
    demoBpm: demoBpm(0.37),
  },
  {
    id: 'standing',
    label: 'Standing',
    instruction: 'Stand up and stay still.',
    holdSec: 60,
    restSec: 0,
    demoBpm: demoBpm(0.42),
  },
  {
    id: 'walking',
    label: 'Walking',
    instruction: 'Walk at an easy, steady pace.',
    holdSec: 60,
    restSec: 0,
    demoBpm: demoBpm(0.52),
  },
  {
    id: 'zone2',
    label: 'Zone 2 (easy)',
    instruction: 'Jog easily — you should still be able to talk.',
    holdSec: 120,
    restSec: 0,
    demoBpm: demoBpm(0.65),
  },
  {
    id: 'zone3',
    label: 'Zone 3 (aerobic)',
    instruction: 'Pick it up to your usual 3 km pace.',
    holdSec: 120,
    restSec: 0,
    demoBpm: demoBpm(0.75),
  },
  {
    id: 'recovery-immediate',
    label: 'Recovery (immediate)',
    instruction: 'Stop and stand still.',
    holdSec: 60,
    restSec: 0,
    demoBpm: demoBpm(0.6),
  },
  {
    id: 'recovery-5min',
    label: 'Recovery (5 min)',
    instruction: 'Rest, then hold still for the final reading.',
    holdSec: 60,
    restSec: 240,
    demoBpm: demoBpm(0.45),
  },
];

/** Stable ids in protocol order. */
export const CALIBRATION_CONDITION_IDS = CALIBRATION_CONDITIONS.map((c) => c.id);

const BY_ID = new Map(CALIBRATION_CONDITIONS.map((c) => [c.id, c]));

export function calibrationCondition(id) {
  const condition = BY_ID.get(id);
  if (!condition) throw new Error(`unknown calibration condition ${id}`);
  return condition;
}

/** Zero-based position of a condition in the protocol. */
export function calibrationConditionOrder(id) {
  calibrationCondition(id);
  return CALIBRATION_CONDITION_IDS.indexOf(id);
}

/** The condition that follows `id`, or null at the end of the protocol. */
export function nextCalibrationCondition(id) {
  const next = CALIBRATION_CONDITIONS[calibrationConditionOrder(id) + 1];
  return next ?? null;
}

export function isFinalCalibrationCondition(id) {
  return nextCalibrationCondition(id) === null;
}

/** Wall-clock seconds the whole protocol takes, rests included. */
export function calibrationDurationSec() {
  return CALIBRATION_CONDITIONS.reduce((total, c) => total + c.restSec + c.holdSec, 0);
}
