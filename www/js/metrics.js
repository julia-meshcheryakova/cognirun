import { CONDITIONS } from './questions.js';
import { clamp } from './protocol.js';

const TRUE_WORDS = new Set(['true', 'yes', 'correct', 'right', 'yeah', 'yep']);
const FALSE_WORDS = new Set(['false', 'no', 'incorrect', 'wrong', 'nope']);

export function normaliseText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBinary(value) {
  if (typeof value === 'boolean') return value;
  const words = normaliseText(value).split(/\s+/).filter(Boolean);
  if (words.some((word) => TRUE_WORDS.has(word))) return true;
  if (words.some((word) => FALSE_WORDS.has(word))) return false;
  return null;
}

export function normaliseDigits(value = '') {
  const words = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9',
  };
  return normaliseText(value)
    .split(/\s+/)
    .map((token) => words[token] ?? token.replace(/\D/g, ''))
    .join('')
    .replace(/\D/g, '');
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

export function parseIdeas(value = '') {
  const text = normaliseText(value);
  const segments = text
    .split(/,|;|\band\b/)
    .map((idea) => idea.trim())
    .filter((idea) => idea.length > 2);
  return [...new Set(segments)];
}

export function scoreRecall(value, targets = []) {
  const targetSet = new Set(targets.map(normaliseText));
  const tokens = normaliseText(value).split(/[\s,;-]+/).filter(Boolean);
  const unique = [...new Set(tokens)];
  const correct = unique.filter((word) => targetSet.has(word));
  const intrusions = unique.filter((word) => !targetSet.has(word));
  const ratio = targets.length ? correct.length / targets.length : 0;
  return {
    correct,
    intrusions,
    ratio,
    score: clamp(ratio - (intrusions.length / Math.max(10, targets.length * 4)), 0, 1),
  };
}

export function scoreTask(task, response, responseMs, meta = {}) {
  const base = {
    usable: true,
    response: String(response ?? '').trim(),
    responseMs: Number.isFinite(responseMs) ? Math.max(0, responseMs) : null,
    confidence: Number.isFinite(meta.confidence) ? clamp(meta.confidence, 0, 1) : null,
    timingMethod: meta.timingMethod || 'manual',
  };

  if (task.mode === 'listen') {
    return { ...base, correct: null, rawScore: null, label: 'Encoded' };
  }
  if (!base.response) {
    return { ...base, usable: false, correct: null, rawScore: null, label: 'No response' };
  }

  if (task.mode === 'binary') {
    const parsed = parseBinary(response);
    if (parsed === null) return { ...base, usable: false, correct: null, rawScore: null, label: 'Unclear' };
    const correct = parsed === Boolean(task.answer);
    const speed = base.responseMs == null ? 0.5 : clamp(1 - ((base.responseMs - 650) / 7350), 0, 1);
    return {
      ...base,
      parsed,
      correct,
      rawScore: correct ? (0.72 + (0.28 * speed)) : 0,
      label: correct ? 'Correct' : 'Incorrect',
    };
  }

  if (task.mode === 'digits') {
    const parsed = normaliseDigits(response);
    const correct = parsed === normaliseDigits(task.answer);
    const positional = task.answer
      ? [...parsed].filter((digit, index) => digit === task.answer[index]).length / task.answer.length
      : 0;
    return {
      ...base,
      parsed,
      correct,
      rawScore: correct ? 1 : positional * 0.45,
      label: correct ? 'Sequence held' : `${Math.round(positional * 100)}% in position`,
    };
  }

  if (task.mode === 'recall') {
    const recall = scoreRecall(response, task.answer);
    return {
      ...base,
      correct: null,
      rawScore: recall.score,
      recall,
      label: `${recall.correct.length}/${task.answer.length} recalled`,
    };
  }

  if (task.mode === 'free') {
    const ideas = parseIdeas(response);
    const rawScore = clamp(ideas.length / 7, 0, 1);
    return {
      ...base,
      correct: null,
      rawScore,
      ideas,
      needsReview: true,
      label: `${ideas.length} distinct idea${ideas.length === 1 ? '' : 's'}`,
    };
  }

  return { ...base, usable: false, correct: null, rawScore: null, label: 'Unsupported' };
}

function domainScore(trials) {
  const usable = trials.filter((trial) => trial.outcome?.usable && Number.isFinite(trial.outcome.rawScore));
  if (!usable.length) return null;
  return usable.reduce((sum, trial) => sum + trial.outcome.rawScore, 0) / usable.length;
}

function indexFrom(score, baseline) {
  if (!Number.isFinite(score) || !Number.isFinite(baseline)) return null;
  return Math.round(clamp(100 + ((score - baseline) * 100), 65, 140));
}

export function calculateMotorCost(trial) {
  if (!['walking', 'zone2', 'zone3'].includes(trial.condition)) return null;
  const before = Number(trial.telemetryWindow?.speedBefore);
  const during = Number(trial.telemetryWindow?.speedDuring);
  if (!(before > 0.4) || !Number.isFinite(during)) return null;
  return ((before - during) / before) * 100;
}

export function computeSessionResults(session) {
  const scoredTrials = session.trials.filter((trial) => trial.task?.mode !== 'listen');
  const domains = ['reasoning', 'workingMemory', 'memory', 'creativity'];
  const conditionOrder = session.protocol.stages.map((stage) => stage.id);
  const curves = {};

  for (const domain of domains) {
    const domainTrials = scoredTrials.filter((trial) => trial.task.domain === domain);
    const seated = domainScore(domainTrials.filter((trial) => trial.condition === 'seated'));
    const availableScores = conditionOrder
      .map((condition) => ({ condition, score: domainScore(domainTrials.filter((trial) => trial.condition === condition)) }))
      .filter((item) => Number.isFinite(item.score));
    const reference = Number.isFinite(seated)
      ? seated
      : (availableScores.length ? availableScores[0].score : null);
    curves[domain] = availableScores.map((item) => ({
      ...item,
      index: indexFrom(item.score, reference),
      baselineAvailable: Number.isFinite(seated),
    }));
  }

  const activeMotorCosts = scoredTrials
    .filter((trial) => ['walking', 'zone2', 'zone3'].includes(trial.condition))
    .map(calculateMotorCost)
    .filter(Number.isFinite);
  const motorCost = median(activeMotorCosts);

  const bestByDomain = {};
  for (const [domain, points] of Object.entries(curves)) {
    if (!points.length) continue;
    const best = [...points].sort((a, b) => b.index - a.index)[0];
    bestByDomain[domain] = best;
  }

  const creativityBest = bestByDomain.creativity;
  const reasoningPoints = curves.reasoning || [];
  let breakpoint = null;
  for (let index = 1; index < reasoningPoints.length; index += 1) {
    const previous = reasoningPoints[index - 1];
    const current = reasoningPoints[index];
    if (current.index < 95 && previous.index - current.index >= 8) {
      breakpoint = current;
      break;
    }
  }

  const recoveryMemory = (curves.memory || []).filter((point) => ['recovery0', 'recovery5'].includes(point.condition));
  const recoveryBest = recoveryMemory.length
    ? [...recoveryMemory].sort((a, b) => b.index - a.index)[0]
    : null;

  const primary = creativityBest || bestByDomain.reasoning || bestByDomain.workingMemory || bestByDomain.memory;
  const usableCount = scoredTrials.filter((trial) => trial.outcome?.usable).length;
  const correctTrials = scoredTrials.filter((trial) => typeof trial.outcome?.correct === 'boolean');
  const correctCount = correctTrials.filter((trial) => trial.outcome.correct).length;

  return {
    curves,
    bestByDomain,
    primary,
    breakpoint,
    recoveryBest,
    motorCost: motorCost == null ? null : Math.round(motorCost * 10) / 10,
    usableCount,
    totalScorable: scoredTrials.length,
    correctCount,
    correctTotal: correctTrials.length,
    distanceKm: (session.telemetry.at(-1)?.distanceM || 0) / 1000,
    confidence: session.kind === 'synthetic' ? 'Synthetic' : (usableCount >= 10 ? 'Early signal' : 'Low — repeat this scan'),
    sessionCount: 1,
  };
}

export function conditionLabel(id) {
  return CONDITIONS[id]?.label || id;
}

export function domainLabel(domain) {
  return ({
    reasoning: 'Logic',
    workingMemory: 'Working memory',
    memory: 'Recall',
    creativity: 'Idea fluency',
  })[domain] || domain;
}
