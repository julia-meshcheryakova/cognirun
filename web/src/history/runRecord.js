/**
 * The stored shape of a finished run. It is the contract between the run flow
 * (which produces it), the run stores (local now, Supabase later) and the
 * history/progress/challenge screens (which read it). Bump RUN_RECORD_SCHEMA
 * and add a migration in `upgradeRunRecord` when the shape changes.
 *
 * @typedef {object} RunAnswerRecord
 * @property {string} questionId
 * @property {string} category        'trivia' | 'logic' | 'math'
 * @property {number} km              1-based segment the question was asked at
 * @property {number} elapsedS        seconds taken to answer
 * @property {string} text            what the runner said or typed
 * @property {string|null} correctAnswer
 * @property {boolean|null} correct
 * @property {number} points
 * @property {string|null} method     judge method: exact | contains | llm | no-match | empty
 *
 * @typedef {object} RunRecord
 * @property {string} id
 * @property {number} schema
 * @property {string} startedAt       ISO timestamp
 * @property {string} finishedAt      ISO timestamp
 * @property {'solo'|'challenge'} mode
 * @property {string|null} challengeId
 * @property {string} course          key of COURSES ('3k', '5k', ...)
 * @property {boolean} demo           simulated run (excluded from progress by default)
 * @property {number} distanceM
 * @property {number} durationS
 * @property {number} avgSpeed        m/s
 * @property {number} points
 * @property {number} correct
 * @property {number} total
 * @property {number|null} hrAvg
 * @property {number|null} hrMax
 * @property {RunAnswerRecord[]} answers
 * @property {{lat:number,lng:number,t:number,distance:number,speed:number,heartRate:number}[]} route
 * @property {boolean} synced         uploaded to the account (Supabase); false while local-only
 */

export const RUN_RECORD_SCHEMA = 1;
export const MAX_ROUTE_POINTS = 300;

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep at most `max` samples, evenly spaced, always including the first and last. */
export function downsample(samples, max = MAX_ROUTE_POINTS) {
  if (samples.length <= max) return samples.slice();
  const step = (samples.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => samples[Math.round(i * step)]);
}

/**
 * Build the record for a run that just finished.
 *
 * @param {object} input
 * @param {object} input.snapshot   the run's final snapshot (distance, elapsedSeconds, samples)
 * @param {object[]} input.answers  the answers collected by the question flow
 * @param {object} input.settings   { course, demo }
 * @param {string|null} [input.challengeId]
 * @param {Date} [input.finishedAt]
 * @returns {RunRecord}
 */
export function toRunRecord({
  snapshot,
  answers,
  settings,
  challengeId = null,
  finishedAt = new Date(),
}) {
  const durationS = snapshot.elapsedSeconds ?? 0;
  const samples = snapshot.samples ?? [];
  const heartRates = samples.map((s) => s.heartRate).filter((bpm) => bpm > 0);
  const route = downsample(samples).map(({ lat, lng, t, distance, speed, heartRate }) => ({
    lat,
    lng,
    t,
    distance,
    speed,
    heartRate,
  }));
  return {
    id: newId(),
    schema: RUN_RECORD_SCHEMA,
    startedAt: new Date(finishedAt.getTime() - durationS * 1000).toISOString(),
    finishedAt: finishedAt.toISOString(),
    mode: challengeId ? 'challenge' : 'solo',
    challengeId,
    course: settings.course,
    demo: Boolean(settings.demo),
    distanceM: snapshot.distance,
    durationS,
    avgSpeed: durationS ? snapshot.distance / durationS : 0,
    points: answers.reduce((sum, a) => sum + a.points, 0),
    correct: answers.filter((a) => a.correct).length,
    total: answers.length,
    hrAvg: heartRates.length
      ? Math.round(heartRates.reduce((sum, bpm) => sum + bpm, 0) / heartRates.length)
      : null,
    hrMax: heartRates.length ? Math.max(...heartRates) : null,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      category: a.category,
      km: a.kilometer,
      elapsedS: a.elapsedSeconds,
      text: a.text ?? '',
      correctAnswer: a.correctAnswer ?? null,
      correct: a.correct ?? null,
      points: a.points,
      method: a.verdict?.method ?? null,
    })),
    route,
    synced: false,
  };
}

/** Bring an older stored record up to the current schema; unknown shapes are dropped. */
export function upgradeRunRecord(record) {
  return record?.schema === RUN_RECORD_SCHEMA ? record : null;
}
