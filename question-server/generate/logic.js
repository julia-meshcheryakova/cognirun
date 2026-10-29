import { numericOptions } from './templates.js';

/**
 * Logic you can do in your head mid-stride: number sequences, odd-one-out and
 * short deductions. Answers are one word or one number.
 */
const NAMES = [
  'Anna', 'Ben', 'Carl', 'Dana', 'Eva', 'Finn', 'Gina', 'Hugo', 'Ivy', 'Jack',
  'Kate', 'Leo', 'Mia', 'Noah', 'Olga', 'Paul', 'Rosa', 'Sam', 'Tom', 'Zoe',
];
const RELATIONS = [
  { more: 'taller', less: 'shorter', top: 'tallest', bottom: 'shortest', second: 'second tallest' },
  { more: 'faster', less: 'slower', top: 'fastest', bottom: 'slowest', second: 'second fastest' },
  { more: 'older', less: 'younger', top: 'oldest', bottom: 'youngest', second: 'second oldest' },
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORDINALS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth',
];
const ORDINAL_SHORT = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
const COLOURS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'orange', 'purple'];
const CLUBS = ['Harbour', 'River', 'Hill', 'Park', 'Forest', 'Lake', 'Valley', 'Bridge', 'Castle', 'Meadow'];
const CONDITIONS = [
  ['raining', 'on the treadmill'],
  ['icy', 'on the track'],
  ['windy', 'in the park'],
  ['snowing', 'indoors'],
  ['dark', 'on the road'],
];

const WORDS = {
  fruit: ['Apple', 'Banana', 'Cherry', 'Mango', 'Pear', 'Grape', 'Plum', 'Peach', 'Lemon'],
  vegetable: ['Carrot', 'Potato', 'Onion', 'Cabbage', 'Leek', 'Spinach', 'Turnip'],
  mammal: ['Dog', 'Horse', 'Cow', 'Sheep', 'Goat', 'Rabbit', 'Lion', 'Tiger'],
  bird: ['Eagle', 'Sparrow', 'Robin', 'Owl', 'Parrot', 'Swan', 'Crow'],
  fish: ['Salmon', 'Trout', 'Cod', 'Tuna', 'Herring'],
  colour: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Pink'],
  shape: ['Circle', 'Square', 'Triangle', 'Hexagon', 'Oval'],
  planet: ['Mars', 'Venus', 'Saturn', 'Jupiter', 'Neptune'],
  country: ['France', 'Spain', 'Italy', 'Japan', 'Brazil', 'Canada', 'Egypt'],
  instrument: ['Piano', 'Guitar', 'Violin', 'Drum', 'Flute', 'Trumpet'],
  sport: ['Tennis', 'Football', 'Rugby', 'Golf', 'Hockey', 'Rowing'],
  month: ['January', 'March', 'April', 'June', 'August', 'October', 'December'],
  day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
};
const EASY_PAIRS = [
  ['colour', 'shape'], ['planet', 'country'], ['instrument', 'sport'], ['day', 'month'],
  ['fruit', 'country'], ['mammal', 'instrument'],
];
const MEDIUM_PAIRS = [['fruit', 'vegetable'], ['mammal', 'bird'], ['fish', 'mammal'], ['bird', 'fish']];
// Two-digit only, so "the single-digit one" is never a competing answer.
const PRIMES = [13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
const ODD_COMPOSITES = [15, 21, 25, 27, 35, 39, 45, 49, 51, 57];

const seq = (rng, terms, next, mistakes) => ({
  prompt: `What comes next: ${terms.join(', ')}?`,
  answer: next,
  options: numericOptions(rng, next, mistakes),
});

function oddOneOut(rng, pairs) {
  const [main, odd] = rng.shuffle(rng.pick(pairs));
  const words = rng.shuffle([...rng.shuffle(WORDS[main]).slice(0, 3), rng.pick(WORDS[odd])]);
  const answer = words.find((w) => WORDS[odd].includes(w));
  return { prompt: `Which is the odd one out: ${words.join(', ')}?`, answer, options: words };
}

/** Names in strict order, best first, described by `count - 1` comparisons. */
function ranking(rng, count, { shuffled, mixed, ask }) {
  const people = rng.shuffle(NAMES).slice(0, count);
  const rel = rng.pick(RELATIONS);
  let facts = people.slice(1).map((lower, i) => {
    const higher = people[i];
    return mixed && rng.next() < 0.5
      ? `${lower} is ${rel.less} than ${higher}.`
      : `${higher} is ${rel.more} than ${lower}.`;
  });
  if (shuffled) facts = rng.shuffle(facts);
  const which = rng.pick(ask);
  const answer = which === 'top' ? people[0] : which === 'bottom' ? people[count - 1] : people[1];
  return {
    prompt: `${facts.join(' ')} Who is the ${rel[which]}?`,
    answer,
    options: rng.shuffle(people),
  };
}

function dayShift(rng, { shifts, phrase }) {
  const today = rng.int(0, 6);
  const shift = rng.pick(shifts);
  const answer = DAYS[(((today + phrase.offset(shift)) % 7) + 7) % 7];
  const idx = DAYS.indexOf(answer);
  const options = [idx, idx + 1, idx - 1, idx + 2]
    .map((i) => ((i % 7) + 7) % 7)
    .sort((a, b) => a - b)
    .map((i) => DAYS[i]);
  return { prompt: phrase.text(DAYS[today], shift), answer, options };
}

const ordinal = (n) => ({ answer: ORDINALS[n - 1], acceptedAnswers: [ORDINAL_SHORT[n - 1]] });
const ordinalOptions = (n) => [n - 1, n, n + 1].filter((i) => i >= 1).map((i) => ORDINALS[i - 1]);

export const LOGIC_TEMPLATES = [
  // ---- easy ----
  {
    key: 'seq-add',
    difficulty: 'easy',
    make(rng) {
      const start = rng.int(1, 20);
      const step = rng.int(2, 9);
      const terms = [0, 1, 2, 3].map((i) => start + i * step);
      return seq(rng, terms, start + 4 * step, [start + 4 * step + step, start + 4 * step - 1]);
    },
  },
  {
    key: 'seq-down',
    difficulty: 'easy',
    make(rng) {
      const start = rng.int(60, 99);
      const step = rng.int(2, 9);
      const terms = [0, 1, 2, 3].map((i) => start - i * step);
      return seq(rng, terms, start - 4 * step, [start - 5 * step, start - 4 * step + 1]);
    },
  },
  { key: 'odd-word', difficulty: 'easy', make: (rng) => oddOneOut(rng, EASY_PAIRS) },
  {
    key: 'rank3',
    difficulty: 'easy',
    make: (rng) => ranking(rng, 3, { shuffled: false, mixed: false, ask: ['top', 'bottom'] }),
  },
  {
    key: 'day',
    difficulty: 'easy',
    make: (rng) =>
      dayShift(rng, {
        shifts: [1, 2, 3],
        phrase: {
          offset: (n) => n,
          text: (day, n) => `If today is ${day}, what day will it be in ${n} day${n > 1 ? 's' : ''}?`,
        },
      }),
  },
  {
    key: 'either',
    difficulty: 'easy',
    make(rng) {
      const [a, b] = rng.shuffle(COLOURS);
      const [item, verb, pronoun, place] = rng.pick([
        ['keys', 'are', 'they', 'bag'],
        ['phone', 'is', 'it', 'box'],
        ['watch', 'is', 'it', 'drawer'],
        ['bottle', 'is', 'it', 'locker'],
      ]);
      const cap = (s) => s[0].toUpperCase() + s.slice(1);
      return {
        prompt: `Your ${item} ${verb} in the ${a} ${place} or the ${b} ${place}. ${cap(pronoun)} ${verb} not in the ${a} ${place}. Which ${place} ${verb} ${pronoun} in?`,
        answer: cap(b),
        options: [cap(a), cap(b), 'Cannot tell'],
      };
    },
  },
  {
    key: 'all-club',
    difficulty: 'easy',
    make(rng) {
      const club = rng.pick(CLUBS);
      const colour = rng.pick(COLOURS);
      const name = rng.pick(NAMES);
      return {
        prompt: `Everyone in the ${club} club wears ${colour}. ${name} is in the ${club} club. Does ${name} wear ${colour}?`,
        answer: 'Yes',
        options: ['Yes', 'No', 'Cannot tell'],
      };
    },
  },

  // ---- medium ----
  {
    key: 'seq-mul',
    difficulty: 'medium',
    make(rng) {
      const start = rng.int(1, 5);
      const ratio = rng.pick([2, 3]);
      const terms = [0, 1, 2, 3].map((i) => start * ratio ** i);
      const next = start * ratio ** 4;
      return seq(rng, terms, next, [terms[3] + (terms[3] - terms[2]), next + ratio]);
    },
  },
  {
    key: 'seq-grow',
    difficulty: 'medium',
    make(rng) {
      const terms = [rng.int(1, 10)];
      let diff = rng.int(1, 4);
      for (let i = 0; i < 4; i++) terms.push(terms[i] + diff++);
      const next = terms[4] + diff;
      return seq(rng, terms, next, [next - 1, next + 1]);
    },
  },
  { key: 'odd-kind', difficulty: 'medium', make: (rng) => oddOneOut(rng, MEDIUM_PAIRS) },
  {
    key: 'odd-multiple',
    difficulty: 'medium',
    make(rng) {
      const k = rng.pick([3, 5, 7, 10]);
      const multiples = rng.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3).map((m) => m * k);
      let odd = rng.int(2, 9) * k + rng.pick([1, 2, -1]);
      while (odd % k === 0 || multiples.includes(odd)) odd += 1;
      const numbers = rng.shuffle([...multiples, odd]);
      return {
        prompt: `Which is the odd one out: ${numbers.join(', ')}?`,
        answer: odd,
        options: numbers.map(String),
      };
    },
  },
  {
    key: 'rank3-mixed',
    difficulty: 'medium',
    make: (rng) => ranking(rng, 3, { shuffled: true, mixed: true, ask: ['top', 'bottom'] }),
  },
  {
    key: 'day-back',
    difficulty: 'medium',
    make: (rng) =>
      rng.next() < 0.5
        ? dayShift(rng, {
            shifts: [2, 3, 4, 5, 6],
            phrase: { offset: (n) => -n, text: (day, n) => `If today is ${day}, what day was it ${n} days ago?` },
          })
        : dayShift(rng, {
            shifts: [2],
            phrase: {
              offset: (n) => -n,
              text: (day) => `If the day after tomorrow is ${day}, what day is it today?`,
            },
          }),
  },
  {
    key: 'if-not',
    difficulty: 'medium',
    make(rng) {
      const [weather, where] = rng.pick(CONDITIONS);
      const name = rng.pick(NAMES);
      return {
        prompt: `When it is ${weather}, ${name} always runs ${where}. Today ${name} is not running ${where}. Is it ${weather}?`,
        answer: 'No',
        options: ['Yes', 'No', 'Cannot tell'],
      };
    },
  },
  {
    key: 'some-club',
    difficulty: 'medium',
    make(rng) {
      const club = rng.pick(CLUBS);
      const name = rng.pick(NAMES);
      const role = rng.pick(['coaches', 'pacers', 'marathoners', 'sprinters']);
      return {
        prompt: `Some members of the ${club} club are ${role}. ${name} is a member. Is ${name} definitely one of the ${role}?`,
        answer: 'No',
        options: ['Yes', 'No'],
      };
    },
  },
  {
    key: 'place-move',
    difficulty: 'medium',
    make(rng) {
      const place = rng.int(3, 9);
      const by = rng.int(1, 2);
      const up = rng.next() < 0.5;
      const target = up ? place - by : place + by;
      const runners = by === 1 ? 'one runner' : 'two runners';
      const placeName = ORDINALS[place - 1].toLowerCase();
      const prompt = up
        ? `You are in ${placeName} place and overtake ${runners}. What place are you in now?`
        : `You are in ${placeName} place and ${runners} ${by === 1 ? 'overtakes' : 'overtake'} you. What place are you in now?`;
      return { prompt, ...ordinal(target), options: ordinalOptions(target) };
    },
  },

  // ---- hard ----
  {
    key: 'seq-fib',
    difficulty: 'hard',
    make(rng) {
      const terms = [rng.int(1, 6), rng.int(1, 6)];
      while (terms.length < 5) terms.push(terms.at(-1) + terms.at(-2));
      const next = terms[4] + terms[3];
      return seq(rng, terms, next, [terms[4] + (terms[4] - terms[3]), next + 1]);
    },
  },
  {
    key: 'seq-alt',
    difficulty: 'hard',
    make(rng) {
      const up = rng.int(3, 7);
      const down = rng.int(1, up - 1);
      const terms = [rng.int(10, 30)];
      for (let i = 0; i < 5; i++) terms.push(terms[i] + (i % 2 === 0 ? up : -down));
      const next = terms[5] - down;
      return seq(rng, terms, next, [terms[5] + up, next + 1]);
    },
  },
  {
    key: 'seq-square',
    difficulty: 'hard',
    make(rng) {
      const n = rng.int(1, 8);
      const plus = rng.pick([0, 0, 1, 2]);
      const terms = [0, 1, 2, 3].map((i) => (n + i) ** 2 + plus);
      const next = (n + 4) ** 2 + plus;
      return seq(rng, terms, next, [next - 2, terms[3] + (terms[3] - terms[2])]);
    },
  },
  {
    key: 'seq-double',
    difficulty: 'hard',
    make(rng) {
      const add = rng.pick([1, 2, -1]);
      const terms = [rng.int(2, 6)];
      for (let i = 0; i < 3; i++) terms.push(terms[i] * 2 + add);
      const next = terms[3] * 2 + add;
      return seq(rng, terms, next, [terms[3] * 2, next + 2]);
    },
  },
  {
    key: 'odd-prime',
    difficulty: 'hard',
    make(rng) {
      const odd = rng.pick(ODD_COMPOSITES);
      const numbers = rng.shuffle([...rng.shuffle(PRIMES).slice(0, 3), odd]);
      return {
        prompt: `Which is the odd one out: ${numbers.join(', ')}?`,
        answer: odd,
        options: numbers.map(String),
      };
    },
  },
  {
    key: 'rank4',
    difficulty: 'hard',
    make: (rng) => ranking(rng, 4, { shuffled: true, mixed: true, ask: ['top', 'bottom', 'second'] }),
  },
  {
    key: 'day-far',
    difficulty: 'hard',
    make: (rng) =>
      rng.next() < 0.6
        ? dayShift(rng, {
            shifts: [10, 11, 12, 13, 15, 16, 17, 19, 20],
            phrase: { offset: (n) => n, text: (day, n) => `If today is ${day}, what day will it be in ${n} days?` },
          })
        : dayShift(rng, {
            shifts: [2],
            phrase: {
              offset: (n) => n,
              text: (day) => `If yesterday was ${day}, what day will it be tomorrow?`,
            },
          }),
  },
  {
    key: 'if-must',
    difficulty: 'hard',
    make(rng) {
      const [weather, where] = rng.pick(CONDITIONS);
      const name = rng.pick(NAMES);
      return {
        prompt: `When it is ${weather}, ${name} always runs ${where}. Today ${name} is running ${where}. Must it be ${weather}?`,
        answer: 'No',
        options: ['Yes', 'No'],
      };
    },
  },
  {
    key: 'all-converse',
    difficulty: 'hard',
    make(rng) {
      const club = rng.pick(CLUBS);
      const colour = rng.pick(COLOURS);
      const name = rng.pick(NAMES);
      return {
        prompt: `Everyone in the ${club} club wears ${colour}. ${name} wears ${colour}. Must ${name} be in the ${club} club?`,
        answer: 'No',
        options: ['Yes', 'No'],
      };
    },
  },
  {
    key: 'overtake',
    difficulty: 'hard',
    make(rng) {
      const place = rng.int(2, 9);
      return {
        prompt: `In a race you overtake the runner in ${ORDINALS[place - 1].toLowerCase()} place. What place are you in now?`,
        ...ordinal(place),
        options: ordinalOptions(place),
      };
    },
  },
];
