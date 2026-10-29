import { numericOptions } from './templates.js';

/**
 * Running-friendly mental maths: every answer is a whole number that is quick
 * to say aloud. `mistakes` are the slips a tired runner actually makes, used as
 * the multiple-choice distractors.
 */
const q = (rng, prompt, answer, mistakes) => ({
  prompt,
  answer,
  options: numericOptions(rng, answer, mistakes),
});

export const MATH_TEMPLATES = [
  // ---- easy ----
  {
    key: 'add',
    difficulty: 'easy',
    make(rng) {
      const a = rng.int(12, 59);
      const b = rng.int(11, 39);
      return q(rng, `What is ${a} plus ${b}?`, a + b, [a + b + 10, a + b - 10]);
    },
  },
  {
    key: 'sub',
    difficulty: 'easy',
    make(rng) {
      const a = rng.int(40, 99);
      const b = rng.int(11, a - 12);
      return q(rng, `What is ${a} minus ${b}?`, a - b, [a - b + 10, a - b - 10]);
    },
  },
  {
    key: 'times',
    difficulty: 'easy',
    make(rng) {
      const a = rng.int(3, 9);
      const b = rng.int(3, 9);
      return q(rng, `What is ${a} times ${b}?`, a * b, [a * (b + 1), (a - 1) * b]);
    },
  },
  {
    key: 'half',
    difficulty: 'easy',
    make(rng) {
      const n = 2 * rng.int(11, 49);
      return q(rng, `What is half of ${n}?`, n / 2, [n / 2 + 5, n / 2 - 5]);
    },
  },
  {
    key: 'laps',
    difficulty: 'easy',
    make(rng) {
      const lap = rng.pick([200, 400]);
      const km = lap === 200 ? rng.int(1, 5) : 2 * rng.int(1, 5);
      const laps = (km * 1000) / lap;
      return q(rng, `How many ${lap} metre laps make ${km} km?`, laps, [laps * 2, Math.ceil(laps / 2)]);
    },
  },
  {
    key: 'left',
    difficulty: 'easy',
    make(rng) {
      const total = rng.pick([5, 10, 15, 21]);
      const done = rng.int(1, total - 1);
      return q(
        rng,
        `A race is ${total} km long and you have run ${done} km. How many km are left?`,
        total - done,
        [total - done + 1, done],
      );
    },
  },

  // ---- medium ----
  {
    key: 'pct',
    difficulty: 'medium',
    make(rng) {
      const p = rng.pick([10, 20, 25, 50, 75]);
      const n = 20 * rng.int(2, 20);
      const answer = (p * n) / 100;
      return q(rng, `What is ${p} percent of ${n}?`, answer, [answer * 2, n - answer]);
    },
  },
  {
    key: 'mul',
    difficulty: 'medium',
    make(rng) {
      const a = rng.int(12, 25);
      const b = rng.int(3, 9);
      return q(rng, `What is ${a} times ${b}?`, a * b, [a * b + b, a * b - 10]);
    },
  },
  {
    key: 'div',
    difficulty: 'medium',
    make(rng) {
      const b = rng.int(3, 12);
      const answer = rng.int(6, 15);
      return q(rng, `What is ${b * answer} divided by ${b}?`, answer, [answer + 1, answer - 1]);
    },
  },
  {
    key: 'pace',
    difficulty: 'medium',
    make(rng) {
      const km = rng.int(2, 10);
      const pace = rng.int(4, 7);
      return q(
        rng,
        `You run ${km} km in ${km * pace} minutes. What is your pace in minutes per km?`,
        pace,
        [pace + 1, pace - 1],
      );
    },
  },
  {
    key: 'duration',
    difficulty: 'medium',
    make(rng) {
      const km = rng.int(2, 10);
      const pace = rng.int(4, 7);
      return q(
        rng,
        `At ${pace} minutes per km, how many minutes does a ${km} km run take?`,
        km * pace,
        [km * pace + pace, km * pace - pace],
      );
    },
  },
  {
    key: 'seconds',
    difficulty: 'medium',
    make(rng) {
      const minutes = rng.int(2, 9);
      return q(rng, `How many seconds are in ${minutes} minutes?`, minutes * 60, [minutes * 100, minutes * 60 + 60]);
    },
  },

  // ---- hard ----
  {
    key: 'distance',
    difficulty: 'hard',
    make(rng) {
      const pace = rng.int(4, 7);
      const km = rng.int(3, 12);
      return q(
        rng,
        `At ${pace} minutes per km, how many km do you cover in ${pace * km} minutes?`,
        km,
        [km + 1, km - 1],
      );
    },
  },
  {
    key: 'speed',
    difficulty: 'hard',
    make(rng) {
      const minutes = rng.pick([20, 30, 40, 45, 50, 60, 90]);
      const speeds = [8, 9, 10, 11, 12, 13, 14, 15].filter((s) => (s * minutes) % 60 === 0);
      const speed = rng.pick(speeds);
      const km = (speed * minutes) / 60;
      return q(
        rng,
        `You run ${km} km in ${minutes} minutes. What is your average speed in km per hour?`,
        speed,
        [speed + 1, speed - 2],
      );
    },
  },
  {
    key: 'cut',
    difficulty: 'hard',
    make(rng) {
      const time = 10 * rng.int(2, 6);
      const p = rng.pick([10, 20, 50, ...(time % 20 === 0 ? [5, 25] : [])]);
      const answer = time - (time * p) / 100;
      return q(
        rng,
        `Your 5 km time is ${time} minutes. If you cut it by ${p} percent, what is your new time in minutes?`,
        answer,
        [time - p, answer - 1],
      );
    },
  },
  {
    key: 'mul2',
    difficulty: 'hard',
    make(rng) {
      const a = rng.int(11, 19);
      const b = rng.int(11, 19);
      return q(rng, `What is ${a} times ${b}?`, a * b, [a * b + 10, a * b - a]);
    },
  },
  {
    key: 'square',
    difficulty: 'hard',
    make(rng) {
      const n = rng.int(11, 20);
      return q(rng, `What is ${n} squared?`, n * n, [n * 2, n * n + n]);
    },
  },
  {
    key: 'pct2',
    difficulty: 'hard',
    make(rng) {
      const p = rng.pick([15, 30, 35, 40, 45, 60]);
      const n = 20 * rng.int(2, 15);
      const answer = (p * n) / 100;
      return q(rng, `What is ${p} percent of ${n}?`, answer, [answer + 5, n - answer]);
    },
  },
  {
    key: 'halfmin',
    difficulty: 'hard',
    make(rng) {
      const minutes = rng.int(2, 9);
      const answer = minutes * 60 + 30;
      return q(rng, `How many seconds are in ${minutes} and a half minutes?`, answer, [minutes * 60 + 50, answer + 60]);
    },
  },
];
