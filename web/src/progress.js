import { COURSES } from './config.js';
import { CATEGORY_LABELS, RUN_CATEGORIES } from './questions.js';

/**
 * Personal progress, computed from stored RunRecords. Pure: no DOM, no clock
 * unless one is passed in (`now`), so every number on the History screen is
 * unit-tested. Demo (simulated) runs are left out unless `includeDemo` is set.
 *
 * Weeks are ISO weeks (Monday start) in UTC, matching the weekly challenge ids
 * (`2026-W02-5k`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** A run counts as a full course (for fastest time) within this share of its distance. */
const COMPLETE_SHARE = 0.99;

const time = (r) => Date.parse(r.finishedAt);
const chronological = (runs) => runs.slice().sort((a, b) => time(a) - time(b));

/**
 * @param {import('./history/runRecord.js').RunRecord[]} runs
 * @param {object} [options]
 * @param {boolean} [options.includeDemo]
 * @param {string|null} [options.course]
 */
export function countedRuns(runs, { includeDemo = false, course } = {}) {
  return runs.filter((r) => (includeDemo || !r.demo) && (course === undefined || course === null || r.course === course));
}

/** Monday 00:00 UTC of the ISO week `date` falls in, as epoch ms. */
export function weekStart(date) {
  const d = new Date(date);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}

/** '2026-W02' for any date in that ISO week. */
export function isoWeekKey(date) {
  const thursday = new Date(weekStart(date) + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Seconds per km, or null when the run covered no distance. */
export function paceOf(run) {
  return run.distanceM > 0 ? run.durationS / (run.distanceM / 1000) : null;
}

/** Share of graded answers that were right, or null when nothing was graded. */
export function accuracyOf(run) {
  return run.total > 0 ? run.correct / run.total : null;
}

/** Whether the run covered its whole course (only those set a fastest time). */
export function isComplete(run) {
  const course = COURSES[run.course];
  return Boolean(course) && run.durationS > 0 && run.distanceM >= course.total * COMPLETE_SHARE;
}

export function totals(runs) {
  return runs.reduce(
    (sum, r) => ({
      runs: sum.runs + 1,
      distanceM: sum.distanceM + (r.distanceM || 0),
      durationS: sum.durationS + (r.durationS || 0),
      points: sum.points + (r.points || 0),
    }),
    { runs: 0, distanceM: 0, durationS: 0, points: 0 },
  );
}

const best = (run, value) => ({ value, runId: run.id, finishedAt: run.finishedAt });

/**
 * Personal bests per course, in COURSES order, for courses with at least one run.
 * Ties keep the earlier run: a PB belongs to whoever set it first.
 *
 * @returns {{course:string,label:string,runs:number,
 *   points:{value:number,runId:string,finishedAt:string},
 *   fastest:{value:number,runId:string,finishedAt:string}|null,
 *   accuracy:{value:number,runId:string,finishedAt:string}|null}[]}
 */
export function personalBests(runs) {
  const byCourse = new Map();
  for (const r of chronological(runs)) {
    const entry = byCourse.get(r.course) ?? {
      course: r.course,
      label: COURSES[r.course]?.label ?? r.course,
      runs: 0,
      points: null,
      fastest: null,
      accuracy: null,
    };
    entry.runs += 1;
    if (!entry.points || r.points > entry.points.value) entry.points = best(r, r.points);
    if (isComplete(r) && (!entry.fastest || r.durationS < entry.fastest.value)) {
      entry.fastest = best(r, r.durationS);
    }
    const accuracy = accuracyOf(r);
    if (accuracy !== null && (!entry.accuracy || accuracy > entry.accuracy.value)) {
      entry.accuracy = best(r, accuracy);
    }
    byCourse.set(r.course, entry);
  }
  const order = Object.keys(COURSES);
  const rank = (course) => (order.includes(course) ? order.indexOf(course) : order.length);
  return [...byCourse.values()].sort((a, b) => rank(a.course) - rank(b.course));
}

/**
 * Accuracy and mean answer time per run category. `accuracy` counts only graded
 * answers (`correct` true/false); `avgTimeS` counts every answer.
 */
export function categoryStats(runs) {
  const answers = runs.flatMap((r) => r.answers ?? []);
  return RUN_CATEGORIES.map((category) => {
    const mine = answers.filter((a) => a.category === category);
    const graded = mine.filter((a) => a.correct === true || a.correct === false);
    const correct = graded.filter((a) => a.correct).length;
    const times = mine.map((a) => a.elapsedS).filter((s) => Number.isFinite(s));
    return {
      category,
      label: CATEGORY_LABELS[category] ?? category,
      answered: mine.length,
      graded: graded.length,
      correct,
      accuracy: graded.length ? correct / graded.length : null,
      avgTimeS: times.length ? times.reduce((sum, s) => sum + s, 0) / times.length : null,
    };
  });
}

/**
 * Category stats per ISO week for the `weeks` weeks ending with the one `now`
 * falls in, oldest first. Weeks without runs are kept so charts stay evenly spaced.
 */
export function weeklyCategoryStats(runs, { weeks = 6, now = Date.now() } = {}) {
  const last = weekStart(now);
  return Array.from({ length: weeks }, (_, i) => {
    const start = last - (weeks - 1 - i) * WEEK_MS;
    const inWeek = runs.filter((r) => weekStart(r.finishedAt) === start);
    return {
      week: isoWeekKey(start),
      start: new Date(start).toISOString(),
      runs: inWeek.length,
      categories: categoryStats(inWeek),
    };
  });
}

/** The last `limit` runs, oldest first, with what the trend charts plot. */
export function recentTrend(runs, { limit = 10 } = {}) {
  return chronological(runs)
    .slice(-limit)
    .map((r) => ({
      id: r.id,
      finishedAt: r.finishedAt,
      course: r.course,
      points: r.points,
      paceSPerKm: paceOf(r),
      accuracy: accuracyOf(r),
    }));
}

/**
 * Consecutive ISO weeks with at least one run. The current streak is still alive
 * when the last run was in the previous week (this week is not over yet).
 */
export function weeklyStreak(runs, { now = Date.now() } = {}) {
  const weeks = [...new Set(runs.map((r) => weekStart(r.finishedAt)))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  weeks.forEach((w, i) => {
    run = i > 0 && w - weeks[i - 1] === WEEK_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
  });

  const have = new Set(weeks);
  let cursor = weekStart(now);
  if (!have.has(cursor)) cursor -= WEEK_MS;
  let current = 0;
  while (have.has(cursor)) {
    current += 1;
    cursor -= WEEK_MS;
  }
  return { current, longest, thisWeek: have.has(weekStart(now)) };
}

export const PB_LABELS = { points: 'Points', time: 'Time', accuracy: 'Accuracy' };

/**
 * Personal bests a just-finished run sets on its course, compared with the runs
 * before it. A course's first run sets nothing (there is nothing to beat), and
 * demo runs set nothing unless `includeDemo`.
 *
 * @returns {{kind:'points'|'time'|'accuracy', label:string, value:number, previous:number|null}[]}
 */
export function newPersonalBests(record, runs, { includeDemo = false } = {}) {
  if (record.demo && !includeDemo) return [];
  const before = countedRuns(runs, { includeDemo, course: record.course }).filter(
    (r) => r.id !== record.id && time(r) <= time(record),
  );
  if (!before.length) return [];
  const [prev] = personalBests(before);
  /** @type {{kind:'points'|'time'|'accuracy', value:number, previous:number|null}[]} */
  const found = [];
  if (record.points > prev.points.value) {
    found.push({ kind: 'points', value: record.points, previous: prev.points.value });
  }
  if (isComplete(record) && (!prev.fastest || record.durationS < prev.fastest.value)) {
    found.push({ kind: 'time', value: record.durationS, previous: prev.fastest?.value ?? null });
  }
  const accuracy = accuracyOf(record);
  if (accuracy !== null && (!prev.accuracy || accuracy > prev.accuracy.value)) {
    found.push({ kind: 'accuracy', value: accuracy, previous: prev.accuracy?.value ?? null });
  }
  return found.map((pb) => ({ ...pb, label: PB_LABELS[pb.kind] }));
}

/** Which PBs (points/time/accuracy) a stored run currently holds on its course. */
export function bestsHeldBy(run, runs, { includeDemo = false } = {}) {
  if (run.demo && !includeDemo) return [];
  const [entry] = personalBests(countedRuns(runs, { includeDemo, course: run.course }));
  if (!entry) return [];
  return /** @type {[string, {runId:string}|null][]} */ ([
    ['points', entry.points],
    ['time', entry.fastest],
    ['accuracy', entry.accuracy],
  ])
    .filter(([, pb]) => pb?.runId === run.id)
    .map(([kind]) => kind);
}

/**
 * Everything the History overview shows, for the runs that count.
 *
 * @param {import('./history/runRecord.js').RunRecord[]} runs
 * @param {object} [options]
 * @param {boolean} [options.includeDemo]
 * @param {string|null} [options.course]
 * @param {number} [options.now]
 * @param {number} [options.trendLimit]
 * @param {number} [options.weeks]
 */
export function progressSummary(
  runs,
  { includeDemo = false, course, now = Date.now(), trendLimit = 10, weeks = 6 } = {},
) {
  const counted = countedRuns(runs, { includeDemo, course });
  return {
    runs: counted,
    totals: totals(counted),
    bests: personalBests(counted),
    categories: categoryStats(counted),
    weekly: weeklyCategoryStats(counted, { weeks, now }),
    trend: recentTrend(counted, { limit: trendLimit }),
    streak: weeklyStreak(counted, { now }),
  };
}
