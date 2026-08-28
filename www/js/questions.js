export const CONDITIONS = {
  seated: { label: 'Seated', short: 'Sit', icon: '◫', colour: '#9aa5b1' },
  standing: { label: 'Standing', short: 'Stand', icon: '│', colour: '#7dd3fc' },
  walking: { label: 'Walking', short: 'Walk', icon: '↗', colour: '#63e6be' },
  zone2: { label: 'Zone 2', short: 'Z2', icon: '●', colour: '#d9ff63' },
  zone3: { label: 'Zone 3', short: 'Z3', icon: '▲', colour: '#ffb84d' },
  recovery0: { label: 'Immediate', short: 'Post', icon: '↓', colour: '#ff7a59' },
  recovery5: { label: '+5 recovery', short: '+5m', icon: '◇', colour: '#c4a7ff' },
};

const EQUATIONS = [
  ['Is fourteen plus nine equal to twenty-three?', true],
  ['Is seventeen plus eight equal to twenty-six?', false],
  ['Is six multiplied by seven equal to forty-two?', true],
  ['Is ninety divided by nine equal to eleven?', false],
  ['Is thirty-four minus seventeen equal to seventeen?', true],
  ['Is twelve multiplied by four equal to fifty-two?', false],
  ['Is eighty-one divided by nine equal to nine?', true],
  ['Is twenty-seven plus sixteen equal to forty-two?', false],
  ['Is sixty-four minus twenty-eight equal to thirty-six?', true],
  ['Is fifteen multiplied by three equal to forty-five?', true],
  ['Is one hundred divided by four equal to twenty-four?', false],
  ['Is forty-nine plus twenty-two equal to seventy-one?', true],
];

const DIGITS = [
  ['4 8 2', '284'],
  ['7 1 9', '917'],
  ['3 6 2 8', '8263'],
  ['5 9 1 4', '4195'],
  ['2 7 4 6', '6472'],
  ['8 3 5 1', '1538'],
  ['6 2 9 4 7', '74926'],
  ['1 8 3 6 5', '56381'],
];

const CREATIVE = [
  ['Name unusual uses for a running shoe.', 'running shoe'],
  ['Name unusual uses for a paper clip.', 'paper clip'],
  ['Name unusual uses for a water bottle.', 'water bottle'],
  ['Name unusual uses for a towel.', 'towel'],
  ['Name unusual uses for a cardboard box.', 'cardboard box'],
];

const MEMORY_LISTS = [
  ['river', 'candle', 'velvet', 'orbit', 'lemon', 'bridge'],
  ['forest', 'button', 'silver', 'planet', 'coffee', 'window'],
  ['garden', 'pencil', 'marble', 'comet', 'orange', 'ladder'],
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(source, random) {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function equationTask(id, condition, item, difficulty = 1) {
  return {
    id,
    condition,
    domain: 'reasoning',
    type: 'equation',
    mode: 'binary',
    prompt: item[0],
    answer: item[1],
    difficulty,
    instruction: 'Answer true or false',
  };
}

function digitTask(id, condition, item, difficulty = 1) {
  return {
    id,
    condition,
    domain: 'workingMemory',
    type: 'digit-reversal',
    mode: 'digits',
    prompt: `Repeat these digits backwards: ${item[0]}.`,
    displayPrompt: `Repeat backwards: ${item[0]}`,
    answer: item[1],
    difficulty,
    instruction: 'Say or type the reversed sequence',
  };
}

function creativityTask(id, condition, item) {
  return {
    id,
    condition,
    domain: 'creativity',
    type: 'alternate-uses',
    mode: 'free',
    prompt: `${item[0]} Give as many different ideas as you can.`,
    displayPrompt: item[0],
    answer: null,
    object: item[1],
    difficulty: 1,
    instruction: 'Separate ideas with commas',
  };
}

export function createTaskPlan(seed = 42) {
  const random = mulberry32(seed);
  const equations = shuffle(EQUATIONS, random);
  const digits = shuffle(DIGITS, random);
  const creative = shuffle(CREATIVE, random);
  const memoryWords = MEMORY_LISTS[Math.floor(random() * MEMORY_LISTS.length)];

  return [
    equationTask('sit-reason', 'seated', equations[0], 1),
    digitTask('sit-memory', 'seated', digits[0], 1),
    creativityTask('sit-create', 'seated', creative[0]),
    equationTask('stand-reason', 'standing', equations[1], 1),
    digitTask('stand-memory', 'standing', digits[1], 1),
    equationTask('walk-reason', 'walking', equations[2], 1),
    creativityTask('walk-create', 'walking', creative[1]),
    equationTask('z2-reason', 'zone2', equations[3], 2),
    digitTask('z2-memory', 'zone2', digits[2], 2),
    equationTask('z3-reason', 'zone3', equations[4], 2),
    digitTask('z3-memory', 'zone3', digits[4], 3),
    {
      id: 'post-recall', condition: 'recovery0', domain: 'memory', type: 'delayed-recall', mode: 'recall',
      prompt: 'Recall the six words you learned at the start. Say every word you remember.',
      answer: memoryWords, difficulty: 2, instruction: 'Order does not matter',
    },
    equationTask('post-reason', 'recovery0', equations[5], 2),
    {
      id: 'five-recall', condition: 'recovery5', domain: 'memory', type: 'delayed-recall', mode: 'recall',
      prompt: 'One final recall. Say every word from the original list that you still remember.',
      answer: memoryWords, difficulty: 2, instruction: 'Order does not matter',
    },
    creativityTask('five-create', 'recovery5', creative[2]),
  ].map((task, order) => ({ ...task, order }));
}

export function createEncodingPrompt(taskPlan) {
  const recall = taskPlan.find((task) => task.type === 'delayed-recall');
  const words = recall?.answer || MEMORY_LISTS[0];
  return {
    id: 'memory-encode',
    condition: 'seated',
    domain: 'memory',
    type: 'encoding',
    mode: 'listen',
    prompt: `Remember these six words for later: ${words.join(', ')}.`,
    displayPrompt: words.join('  ·  '),
    answer: words,
    instruction: 'Listen carefully — recall comes after the run',
    order: -1,
  };
}

export const DEMO_RESPONSES = {
  'sit-reason': 'true',
  'sit-memory': '284',
  'sit-create': 'plant pot, door stop, phone stand, bird feeder',
  'stand-reason': 'false',
  'stand-memory': '917',
  'walk-reason': 'true',
  'walk-create': 'jewellery clasp, tiny compass, reset tool, sculpture armature, bookmark, zipper pull',
  'z2-reason': 'true',
  'z2-memory': '8263',
  'z3-reason': 'false',
  'z3-memory': '7492',
  'post-recall': 'river candle velvet orbit bridge',
  'post-reason': 'false',
  'five-recall': 'river candle velvet orbit lemon bridge',
  'five-create': 'seed scoop, mini funnel, plant irrigator, lantern shade, percussion shaker',
};

export const SYNTHETIC_COHORT = [
  { id: 'P-014', type: 'Idea walker', creativity: 118, reasoning: 101, memory: 103, breakpoint: 'Walk', motorCost: 1.2 },
  { id: 'P-027', type: 'Post-run sharp', creativity: 106, reasoning: 112, memory: 116, breakpoint: '+5m', motorCost: 2.7 },
  { id: 'P-031', type: 'Zone 2 steady', creativity: 108, reasoning: 109, memory: 107, breakpoint: 'Z2', motorCost: 0.8 },
  { id: 'P-046', type: 'High-load decline', creativity: 97, reasoning: 88, memory: 84, breakpoint: 'Z3', motorCost: 6.1 },
  { id: 'P-052', type: 'Neutral responder', creativity: 101, reasoning: 100, memory: 99, breakpoint: 'None yet', motorCost: 1.6 },
  { id: 'P-063', type: 'Pace protector', creativity: 110, reasoning: 104, memory: 105, breakpoint: 'Z3', motorCost: 7.4 },
  { id: 'P-078', type: 'Standing starter', creativity: 104, reasoning: 107, memory: 102, breakpoint: 'Stand', motorCost: 1.0 },
  { id: 'P-091', type: 'Recovery responder', creativity: 111, reasoning: 108, memory: 114, breakpoint: 'Post', motorCost: 3.2 },
];
