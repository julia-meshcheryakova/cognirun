import { CHALLENGE_COURSES, courseOf } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO-8601 week of a date (UTC): { year, week }. Weeks start on Monday. */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7) };
}

export function weekKey({ year, week }) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 UTC of an ISO week. */
export function weekStart({ year, week }) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS;
  return new Date(monday + (week - 1) * 7 * DAY_MS);
}

/** '2026-W02-5k' -> { year: 2026, week: 2, course: '5k' } or null. */
export function parseChallengeId(id) {
  const match = /^(\d{4})-W(\d{2})-([a-z0-9]+)$/.exec(id ?? '');
  if (!match || !CHALLENGE_COURSES.includes(match[3])) return null;
  return { year: Number(match[1]), week: Number(match[2]), course: match[3] };
}

/**
 * A weekly challenge. Ids are deterministic per ISO week and length, so every
 * device (and the server) agrees on this week's challenges without a backend.
 *
 * @typedef {object} Challenge
 * @property {string} id         '2026-W02-5k'
 * @property {string} week       '2026-W02'
 * @property {string} course     '3k' | '5k' | '10k'
 * @property {string} title
 * @property {string|null} theme thematic challenges (admin-set) later
 * @property {string} startsAt   ISO, Monday 00:00 UTC
 * @property {string} endsAt     ISO, next Monday 00:00 UTC (exclusive)
 */
export function challengeFor(week, course) {
  const start = weekStart(week);
  return {
    id: `${weekKey(week)}-${course}`,
    week: weekKey(week),
    course,
    title: `Weekly ${courseOf(course).label}`,
    theme: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7 * DAY_MS).toISOString(),
  };
}

export function challengeById(id) {
  const parsed = parseChallengeId(id);
  return parsed ? challengeFor(parsed, parsed.course) : null;
}

/** This week's challenges, one per length. */
export function weeklyChallenges(now = new Date()) {
  const week = isoWeek(now);
  return CHALLENGE_COURSES.map((course) => challengeFor(week, course));
}

export function isOpen(challenge, now = new Date()) {
  const t = now.getTime();
  return t >= Date.parse(challenge.startsAt) && t < Date.parse(challenge.endsAt);
}

/** Time left as "3d 4h" / "5h 12m". */
export function timeLeft(challenge, now = new Date()) {
  const ms = Math.max(0, Date.parse(challenge.endsAt) - now.getTime());
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}
