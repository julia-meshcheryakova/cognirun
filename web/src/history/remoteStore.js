import { filterRuns } from './store.js';
import { RUN_RECORD_SCHEMA } from './runRecord.js';

/**
 * RunStore adapter backed by Supabase (tables `runs` + `run_answers`, see
 * supabase/migrations). Same contract as createLocalRunStore in store.js.
 * Records it returns are `synced: true`. RLS limits every query to the
 * signed-in user's own runs.
 */

const REMOTE_LIST_LIMIT = 1000;
const RUN_COLUMNS =
  'id, schema, started_at, finished_at, mode, challenge_id, course, demo, distance_m, duration_s, avg_speed, points, correct, total, hr_avg, hr_max, route';
const ANSWER_COLUMNS = 'idx, question_id, category, km, elapsed_s, text, correct_answer, correct, points, method';
const SELECT = `${RUN_COLUMNS}, run_answers(${ANSWER_COLUMNS})`;

const roundOrNull = (n) => (Number.isFinite(n) ? Math.round(n) : null);

/** RunRecord -> `runs` row. */
export function toRunRow(record, userId) {
  return {
    id: record.id,
    user_id: userId,
    schema: record.schema ?? RUN_RECORD_SCHEMA,
    started_at: record.startedAt,
    finished_at: record.finishedAt,
    mode: record.mode ?? (record.challengeId ? 'challenge' : 'solo'),
    challenge_id: record.challengeId ?? null,
    course: record.course,
    demo: Boolean(record.demo),
    distance_m: record.distanceM ?? 0,
    duration_s: record.durationS ?? 0,
    avg_speed: record.avgSpeed ?? 0,
    points: Math.round(record.points ?? 0),
    correct: record.correct ?? 0,
    total: record.total ?? 0,
    hr_avg: roundOrNull(record.hrAvg),
    hr_max: roundOrNull(record.hrMax),
    route: record.route ?? [],
  };
}

/** RunRecord.answers -> `run_answers` rows (idx keeps their order). */
export function toAnswerRows(record, userId) {
  return (record.answers ?? []).map((a, idx) => ({
    run_id: record.id,
    idx,
    user_id: userId,
    question_id: a.questionId,
    category: a.category,
    km: a.km,
    elapsed_s: a.elapsedS ?? null,
    text: a.text ?? '',
    correct_answer: a.correctAnswer ?? null,
    correct: a.correct ?? null,
    points: Math.round(a.points ?? 0),
    method: a.method ?? null,
  }));
}

/** `runs` row (with embedded `run_answers`) -> RunRecord. */
export function fromRunRow(row) {
  const answers = (row.run_answers ?? [])
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((a) => ({
      questionId: a.question_id,
      category: a.category,
      km: a.km,
      elapsedS: a.elapsed_s,
      text: a.text ?? '',
      correctAnswer: a.correct_answer ?? null,
      correct: a.correct ?? null,
      points: a.points,
      method: a.method ?? null,
    }));
  return {
    id: row.id,
    schema: row.schema ?? RUN_RECORD_SCHEMA,
    // timestamptz comes back as '2026-01-05T10:00:00+00:00'; keep the app's ISO form.
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: new Date(row.finished_at).toISOString(),
    mode: row.mode,
    challengeId: row.challenge_id ?? null,
    course: row.course,
    demo: Boolean(row.demo),
    distanceM: row.distance_m,
    durationS: row.duration_s,
    avgSpeed: row.avg_speed,
    points: row.points,
    correct: row.correct,
    total: row.total,
    hrAvg: row.hr_avg ?? null,
    hrMax: row.hr_max ?? null,
    answers,
    route: Array.isArray(row.route) ? row.route : [],
    synced: true,
  };
}

function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

/**
 * @param {object} options
 * @param {object} options.client  supabase-js client
 * @param {string} options.userId  the signed-in user's id
 * @returns {import('./store.js').RunStore}
 */
export function createRemoteRunStore({ client, userId }) {
  const listeners = new Set();
  const changed = () => listeners.forEach((listener) => listener());

  return {
    /** @param {import('./store.js').RunFilter} [filter] */
    async list({ includeDemo = true, course, challengeId } = {}) {
      let query = client.from('runs').select(SELECT).eq('user_id', userId);
      if (!includeDemo) query = query.eq('demo', false);
      if (course !== undefined) query = query.eq('course', course);
      if (challengeId === null) query = query.is('challenge_id', null);
      else if (challengeId !== undefined) query = query.eq('challenge_id', challengeId);
      const rows = check(await query.order('finished_at', { ascending: false }).limit(REMOTE_LIST_LIMIT));
      // filterRuns again so the semantics match the local store exactly.
      return filterRuns((rows ?? []).map(fromRunRow), { includeDemo, course, challengeId });
    },
    async get(id) {
      const row = check(await client.from('runs').select(SELECT).eq('id', id).maybeSingle());
      return row ? fromRunRow(row) : null;
    },
    async save(record) {
      check(await client.from('runs').upsert(toRunRow(record, userId), { onConflict: 'id' }));
      const answers = toAnswerRows(record, userId);
      if (answers.length) {
        check(await client.from('run_answers').upsert(answers, { onConflict: 'run_id,idx' }));
      }
      changed();
      return { ...record, synced: true };
    },
    async remove(id) {
      check(await client.from('runs').delete().eq('id', id));
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
