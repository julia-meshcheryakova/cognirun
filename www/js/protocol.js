import { CONDITIONS, createEncodingPrompt, createTaskPlan } from './questions.js';

export const PROTOCOL_VERSION = 'explore-v1';

export const DEFAULT_STAGES = [
  { id: 'seated', duration: 120, stabilise: 18, target: 'Resting', instruction: 'Sit comfortably and keep both feet still.' },
  { id: 'standing', duration: 90, stabilise: 15, target: 'Upright baseline', instruction: 'Stand naturally. Keep looking ahead.' },
  { id: 'walking', duration: 180, stabilise: 24, target: 'Easy walk', instruction: 'Walk at a natural, conversational pace.' },
  { id: 'zone2', duration: 240, stabilise: 30, target: '60–70% HR reserve', instruction: 'Settle into an easy run you could sustain.' },
  { id: 'zone3', duration: 180, stabilise: 24, target: '70–80% HR reserve', instruction: 'Build to a controlled, comfortably hard effort.' },
  { id: 'recovery0', duration: 60, stabilise: 5, target: 'Within 60 sec', instruction: 'Stop safely. Keep standing and breathe naturally.' },
  { id: 'recovery5', duration: 300, stabilise: 30, target: '+5 min', instruction: 'Recover comfortably. Your final probes follow.' },
];

const TASK_FRACTIONS = {
  seated: [0.26, 0.5, 0.76],
  standing: [0.38, 0.72],
  walking: [0.42, 0.75],
  zone2: [0.4, 0.72],
  zone3: [0.42, 0.72],
  recovery0: [0.18, 0.58],
  recovery5: [0.8, 0.9],
};

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function estimateMaxHr(age) {
  return Math.round(208 - (0.7 * clamp(Number(age) || 30, 16, 90)));
}

export function computeHeartRateProfile(input = {}) {
  const age = clamp(Number(input.age) || 30, 16, 90);
  const restingHr = clamp(Number(input.restingHr) || 62, 35, 110);
  const suppliedMax = Number(input.maxHr);
  const maxHr = clamp(suppliedMax || estimateMaxHr(age), restingHr + 40, 230);
  const reserve = maxHr - restingHr;
  const range = (low, high) => [Math.round(restingHr + reserve * low), Math.round(restingHr + reserve * high)];
  return {
    age,
    restingHr,
    maxHr,
    reserve,
    source: suppliedMax ? 'user' : 'estimated',
    zones: {
      zone1: range(0.5, 0.6),
      zone2: range(0.6, 0.7),
      zone3: range(0.7, 0.8),
      zone4: range(0.8, 0.9),
      zone5: range(0.9, 1),
    },
  };
}

export function hrZoneFor(hr, profile) {
  if (!Number.isFinite(hr) || !profile) return { id: 'unknown', label: 'No signal' };
  if (hr < profile.zones.zone1[0]) return { id: 'rest', label: 'Below Z1' };
  for (let zone = 1; zone <= 5; zone += 1) {
    const range = profile.zones[`zone${zone}`];
    if (hr <= range[1]) return { id: `zone${zone}`, label: `Zone ${zone}` };
  }
  return { id: 'zone5', label: 'Zone 5' };
}

export function createParticipant(input = {}) {
  const profile = computeHeartRateProfile(input);
  return {
    anonymousId: input.anonymousId || `CR-${Math.floor(1000 + Math.random() * 9000)}`,
    name: String(input.name || 'Runner').trim().slice(0, 40),
    focus: input.focus || 'mixed',
    ...profile,
  };
}

export function targetForStage(stageId, participant) {
  if (!participant) return null;
  if (stageId === 'zone2') return participant.zones.zone2;
  if (stageId === 'zone3') return participant.zones.zone3;
  if (stageId === 'walking') return [participant.restingHr + 12, participant.zones.zone1[1]];
  if (stageId === 'standing') return [participant.restingHr, participant.restingHr + 18];
  if (stageId === 'seated') return [participant.restingHr - 5, participant.restingHr + 10];
  return null;
}

export function createProtocol({ seed = Date.now(), includeZone3 = true } = {}) {
  const taskPlan = createTaskPlan(seed);
  const encoding = createEncodingPrompt(taskPlan);
  const stages = DEFAULT_STAGES
    .filter((stage) => includeZone3 || stage.id !== 'zone3')
    .map((stage) => {
      const stageTasks = taskPlan.filter((task) => task.condition === stage.id);
      if (stage.id === 'seated') stageTasks.unshift(encoding);
      const fractions = TASK_FRACTIONS[stage.id] || [];
      return {
        ...stage,
        ...CONDITIONS[stage.id],
        tasks: stageTasks.map((task, index) => ({
          ...task,
          triggerAt: Math.max(stage.stabilise + 2, Math.round(stage.duration * (fractions[index] || 0.65))),
        })),
      };
    });
  return {
    version: PROTOCOL_VERSION,
    seed,
    stages,
    totalDuration: stages.reduce((sum, stage) => sum + stage.duration, 0),
  };
}

export class ProtocolMachine {
  constructor(protocol) {
    this.protocol = protocol;
    this.status = 'idle';
    this.stageIndex = 0;
    this.stageElapsed = 0;
    this.protocolElapsed = 0;
    this.emitted = new Set();
    this.stageResults = [];
  }

  get stage() {
    return this.protocol.stages[this.stageIndex] || null;
  }

  start() {
    if (this.status === 'complete') return [];
    this.status = 'running';
    return [{ type: 'stage-enter', stage: this.stage, stageIndex: this.stageIndex }];
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'running';
  }

  skipStage(reason = 'manual-skip') {
    if (!this.stage || this.status === 'complete') return [];
    return this.#advance({ skipped: true, reason });
  }

  tick(deltaSeconds) {
    if (this.status !== 'running' || !this.stage) return [];
    const delta = clamp(Number(deltaSeconds) || 0, 0, 10);
    this.stageElapsed += delta;
    this.protocolElapsed += delta;
    const events = [];

    for (const task of this.stage.tasks) {
      if (this.stageElapsed >= task.triggerAt && !this.emitted.has(task.id)) {
        this.emitted.add(task.id);
        events.push({ type: 'task-due', stage: this.stage, task });
      }
    }

    if (this.stageElapsed >= this.stage.duration) {
      events.push(...this.#advance({ skipped: false }));
    }
    return events;
  }

  #advance(result) {
    const completedStage = this.stage;
    this.stageResults.push({
      id: completedStage.id,
      elapsed: this.stageElapsed,
      completedAt: this.protocolElapsed,
      ...result,
    });
    this.stageIndex += 1;
    this.stageElapsed = 0;
    if (this.stageIndex >= this.protocol.stages.length) {
      this.status = 'complete';
      return [
        { type: 'stage-exit', stage: completedStage, result },
        { type: 'protocol-complete' },
      ];
    }
    return [
      { type: 'stage-exit', stage: completedStage, result },
      { type: 'stage-enter', stage: this.stage, stageIndex: this.stageIndex },
    ];
  }

  progress() {
    return this.protocol.totalDuration
      ? clamp(this.protocolElapsed / this.protocol.totalDuration, 0, 1)
      : 0;
  }

  snapshot() {
    return {
      status: this.status,
      stageIndex: this.stageIndex,
      stageElapsed: this.stageElapsed,
      protocolElapsed: this.protocolElapsed,
      emitted: [...this.emitted],
      stageResults: [...this.stageResults],
    };
  }
}
