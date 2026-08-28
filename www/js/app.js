import {
  ProtocolMachine,
  computeHeartRateProfile,
  createParticipant,
  createProtocol,
  targetForStage,
} from './protocol.js';
import { CONDITIONS, SYNTHETIC_COHORT } from './questions.js';
import { TelemetryHub, formatPace } from './telemetry.js';
import { VoiceEngine } from './voice.js';
import {
  calculateMotorCost,
  computeSessionResults,
  conditionLabel,
  domainLabel,
  scoreTask,
} from './metrics.js';
import {
  addTrial,
  appendEvent,
  appendTelemetry,
  completeSession,
  createSession,
  downloadSession,
  loadSettings,
  persistActiveSession,
  saveSettings,
} from './store.js';
import { drawCohortBars, drawConditionCurve, drawTelemetrySparkline } from './charts.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  view: 'home',
  previewProtocol: createProtocol({ seed: 20260829 }),
  participant: null,
  protocol: null,
  machine: null,
  telemetry: null,
  voice: null,
  session: null,
  results: null,
  activeDomain: 'creativity',
  currentTask: null,
  currentTrial: null,
  taskQueue: [],
  taskSpeedSamples: [],
  promptEndedAt: 0,
  loopHandle: 0,
  lastFrameAt: 0,
  sampleAccumulator: 0,
  recoveryAnchor: null,
  protocolEnded: false,
  demoMode: true,
  demoSpeed: 30,
  autoDemo: true,
  finishing: false,
};

const SAMPLE_RESULTS = {
  curves: {
    creativity: [
      { condition: 'seated', index: 100 }, { condition: 'standing', index: 104 },
      { condition: 'walking', index: 116 }, { condition: 'recovery5', index: 109 },
    ],
    reasoning: [
      { condition: 'seated', index: 100 }, { condition: 'standing', index: 102 },
      { condition: 'walking', index: 104 }, { condition: 'zone2', index: 107 },
      { condition: 'zone3', index: 91 }, { condition: 'recovery0', index: 106 },
    ],
    workingMemory: [
      { condition: 'seated', index: 100 }, { condition: 'standing', index: 99 },
      { condition: 'zone2', index: 105 }, { condition: 'zone3', index: 88 },
    ],
    memory: [{ condition: 'recovery0', index: 100 }, { condition: 'recovery5', index: 114 }],
  },
  bestByDomain: { creativity: { condition: 'walking', index: 116 } },
  primary: { condition: 'walking', index: 116 },
  breakpoint: { condition: 'zone3', index: 91 },
  recoveryBest: { condition: 'recovery5', index: 114 },
  motorCost: 4.2,
  usableCount: 14,
  totalScorable: 15,
  confidence: 'Preview',
  distanceKm: 1.63,
};

function toast(message, timeout = 2600) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove('show'), timeout);
}

function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function showView(name) {
  if (name === 'results' && !state.results) renderResults(SAMPLE_RESULTS, { preview: true });
  state.view = name;
  $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === name));
  $$('.bottom-nav [data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === name));
  document.body.classList.toggle('session-active', name === 'session');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'study') renderStudy();
}

function renderProtocol() {
  const stages = state.previewProtocol.stages;
  $('#home-method-track').replaceChildren(...stages.map((stage) => {
    const node = document.createElement('div');
    node.className = 'method-stage';
    node.style.setProperty('--stage-colour', stage.colour);
    node.innerHTML = `<span>${stage.short}</span><b>${stage.label}</b>`;
    return node;
  }));
  $('#setup-protocol').replaceChildren(...stages.map((stage) => {
    const node = document.createElement('div');
    node.className = 'vertical-stage';
    node.style.setProperty('--stage-colour', stage.colour);
    node.innerHTML = `<i>${stage.icon}</i><div><b>${stage.label}</b><span>${stage.target}</span></div><small>${Math.round(stage.duration / 60)}m</small>`;
    return node;
  }));
}

function renderSessionProtocol() {
  const stages = state.protocol?.stages || state.previewProtocol.stages;
  $('#session-protocol').replaceChildren(...stages.map((stage, index) => {
    const node = document.createElement('div');
    node.className = `compact-stage${index < (state.machine?.stageIndex || 0) ? ' complete' : ''}${index === state.machine?.stageIndex ? ' active' : ''}`;
    node.style.setProperty('--stage-colour', stage.colour);
    node.textContent = stage.short;
    return node;
  }));
}

function updateZonePreview() {
  const profile = computeHeartRateProfile({
    age: $('#participant-age').value,
    restingHr: $('#participant-rest').value,
    maxHr: $('#participant-max').value,
  });
  $('#zone-preview').innerHTML = `
    <div><span>ZONE 2 · EASY RUN</span><strong>${profile.zones.zone2[0]}–${profile.zones.zone2[1]} BPM</strong></div>
    <div><span>ZONE 3 · CONTROLLED</span><strong>${profile.zones.zone3[0]}–${profile.zones.zone3[1]} BPM</strong></div>`;
}

function telemetryStatus(channel, status, message) {
  const map = { roxfit: '#device-roxfit', hr: '#device-garmin', gps: '#device-gps' };
  const row = $(map[channel]);
  if (row) {
    row.classList.toggle('live', status === 'live');
    const description = row.querySelector('span');
    if (description && message) description.textContent = message;
    const button = row.querySelector('button');
    if (button) button.textContent = status === 'live' ? 'Live' : (status === 'connecting' ? 'Wait…' : 'Retry');
  }
  if (message) toast(message);
  $('#status-roxfit span').textContent = state.telemetry?.status?.() || 'ROXFIT sandbox';
}

function voiceStatus(status, message) {
  const pill = $('#status-voice');
  pill.classList.toggle('error', status === 'fallback');
  pill.querySelector('span').textContent = message;
  $('#voice-state').textContent = status === 'listening' ? 'LISTENING' : status === 'processing' ? 'PROCESSING' : status === 'speaking' ? 'SPEAKING' : 'EYES FORWARD';
}

async function initialiseServices() {
  const settings = loadSettings();
  if (settings.name) $('#participant-name').value = settings.name;
  if (settings.age) $('#participant-age').value = settings.age;
  if (settings.restingHr) $('#participant-rest').value = settings.restingHr;
  if (settings.maxHr) $('#participant-max').value = settings.maxHr;
  updateZonePreview();
  state.participant = createParticipant({
    name: $('#participant-name').value,
    age: $('#participant-age').value,
    restingHr: $('#participant-rest').value,
    maxHr: $('#participant-max').value,
  });
  state.telemetry = new TelemetryHub({ participant: state.participant, seed: 20260829, onStatus: telemetryStatus });
  await state.telemetry.initialise();
  state.voice = new VoiceEngine({ onStatus: voiceStatus });
  await state.voice.initialise();
  $('#voice-mode-label').textContent = state.voice.label();
  $('#task-provider').textContent = state.voice.mode === 'elevenlabs' ? 'ELEVENLABS' : 'VOICE FALLBACK';
}

function readParticipant() {
  const data = new FormData($('#setup-form'));
  return createParticipant({
    name: data.get('name'),
    focus: data.get('focus'),
    age: data.get('age'),
    restingHr: data.get('restingHr'),
    maxHr: data.get('maxHr'),
  });
}

async function connectHeartRate() {
  try {
    await state.telemetry.connectHeartRate();
  } catch (error) {
    telemetryStatus('hr', 'error', error.message);
  }
}

async function connectGps() {
  try {
    await state.telemetry.connectGps();
  } catch (error) {
    telemetryStatus('gps', 'error', error.message);
  }
}

async function enableMicrophone() {
  try {
    await state.voice.primeMicrophone();
    $('#device-voice').classList.add('live');
    $('#enable-mic').textContent = 'Ready';
    $('#voice-mode-label').textContent = state.voice.label();
    toast('Microphone ready for voice responses.');
  } catch (error) {
    toast(`Microphone unavailable: ${error.message}`);
  }
}

function startSession(event) {
  event?.preventDefault?.();
  if (!$('#consent-safe').checked || !$('#consent-data').checked) {
    toast('Confirm both safety and local-data statements before starting.');
    return;
  }

  state.participant = readParticipant();
  state.demoMode = $('#demo-mode').checked;
  state.demoSpeed = Number($('#demo-speed').value) || 30;
  state.autoDemo = $('#auto-demo').checked;
  state.protocol = createProtocol({ seed: 20260829 });
  state.machine = new ProtocolMachine(state.protocol);
  state.telemetry.participant = state.participant;
  state.telemetry.simulator.participant = state.participant;
  state.telemetry.simulator.hr = state.participant.restingHr + 2;
  const live = state.telemetry.bluetooth.connected || state.telemetry.gps.connected;
  state.session = createSession({
    participant: state.participant,
    protocol: state.protocol,
    telemetryMode: live ? 'hybrid' : 'simulation',
  });
  state.results = null;
  state.currentTask = null;
  state.currentTrial = null;
  state.taskQueue = [];
  state.sampleAccumulator = 0;
  state.recoveryAnchor = null;
  state.protocolEnded = false;
  state.finishing = false;
  state.telemetry.setStage('seated');
  saveSettings({
    name: state.participant.name,
    age: state.participant.age,
    restingHr: state.participant.restingHr,
    maxHr: $('#participant-max').value || '',
  });
  appendEvent(state.session, 'session-start', { telemetryMode: state.session.telemetryMode, demoSpeed: state.demoMode ? state.demoSpeed : 1 });
  persistActiveSession(state.session);
  renderSessionProtocol();
  showView('session');
  handleProtocolEvents(state.machine.start());
  state.lastFrameAt = performance.now();
  cancelAnimationFrame(state.loopHandle);
  state.loopHandle = requestAnimationFrame(runLoop);
}

function runLoop(now) {
  if (!state.machine || state.machine.status === 'complete' && state.finishing) return;
  const wallDelta = Math.min(.25, Math.max(0, (now - state.lastFrameAt) / 1000));
  state.lastFrameAt = now;
  const multiplier = state.demoMode && !state.currentTask ? state.demoSpeed : 1;
  const protocolDelta = state.machine.status === 'running' ? wallDelta * multiplier : 0;
  const events = state.machine.tick(protocolDelta);
  handleProtocolEvents(events);
  state.sampleAccumulator += protocolDelta;
  while (state.sampleAccumulator >= 1) {
    const sample = state.telemetry.sample(1, state.machine.protocolElapsed);
    appendTelemetry(state.session, sample);
    state.sampleAccumulator -= 1;
    if (state.currentTask) state.taskSpeedSamples.push(sample.speedMps);
  }
  updateLiveUi();
  if (!state.finishing) state.loopHandle = requestAnimationFrame(runLoop);
}

function handleProtocolEvents(events) {
  for (const event of events) {
    if (event.type === 'stage-enter') enterStage(event.stage, event.stageIndex);
    if (event.type === 'stage-exit') appendEvent(state.session, 'stage-exit', { stageId: event.stage.id, result: event.result });
    if (event.type === 'task-due') queueTask(event.task);
    if (event.type === 'protocol-complete') {
      state.protocolEnded = true;
      if (!state.currentTask && !state.taskQueue.length) finishSession();
    }
  }
}

function enterStage(stage, index) {
  state.telemetry.setStage(stage.id);
  state.telemetry.setCognitiveLoad(0);
  if (stage.id === 'recovery0') {
    state.recoveryAnchor = state.machine.protocolElapsed;
    appendEvent(state.session, 'exercise-stop', { protocolTime: state.recoveryAnchor });
  }
  appendEvent(state.session, 'stage-enter', { stageId: stage.id, stageIndex: index });
  $('#stage-eyebrow').textContent = stage.id.startsWith('recovery') ? 'RECOVERY WINDOW' : `${stage.label.toUpperCase()} CONDITION`;
  $('#stage-name').textContent = stage.label;
  $('#stage-instruction').textContent = stage.instruction;
  $('#session-stage-count').textContent = `STAGE ${index + 1} / ${state.protocol.stages.length}`;
  const target = targetForStage(stage.id, state.participant);
  $('#stage-target').textContent = target ? `${target[0]}–${target[1]} BPM` : stage.target;
  $('#next-task-copy').innerHTML = `Settle into ${stage.label.toLowerCase()}.<br>Your next voice probe is coming up.`;
  renderSessionProtocol();
  const overlay = $('#transition-overlay');
  $('#transition-stage').textContent = stage.label;
  $('#transition-instruction').textContent = stage.instruction;
  overlay.hidden = false;
  window.setTimeout(() => { overlay.hidden = true; }, state.demoMode ? 600 : 1400);
  if (!state.demoMode) state.voice.speak(`${stage.label}. ${stage.instruction}`);
  try { navigator.vibrate?.([90, 60, 90]); } catch { /* optional */ }
}

function queueTask(task) {
  if (state.session.trials.some((trial) => trial.id === task.id) || state.currentTask?.id === task.id || state.taskQueue.some((queued) => queued.id === task.id)) return;
  if (state.currentTask) state.taskQueue.push(task);
  else presentTask(task);
}

async function presentTask(task) {
  state.currentTask = task;
  state.taskSpeedSamples = [];
  state.telemetry.setCognitiveLoad(task.domain === 'workingMemory' ? 1 : .65);
  const beforeSamples = state.session.telemetry.slice(-20).map((sample) => sample.speedMps);
  state.currentTrial = {
    id: task.id,
    condition: task.condition,
    task,
    promptStartedAt: performance.now(),
    protocolTime: state.machine.protocolElapsed,
    recoveryOffsetSec: state.recoveryAnchor != null && task.condition.startsWith('recovery')
      ? Math.round(state.machine.protocolElapsed - state.recoveryAnchor)
      : null,
    telemetryWindow: { speedBefore: average(beforeSamples) },
    outcome: null,
  };
  appendEvent(state.session, 'prompt-start', { taskId: task.id, condition: task.condition, domain: task.domain });
  $('.session-main').classList.add('task-open');
  $('#eyes-forward').hidden = true;
  $('#task-card').hidden = false;
  $('#task-domain').textContent = domainLabel(task.domain).toUpperCase();
  $('#task-state').textContent = 'LISTEN';
  $('#task-prompt').textContent = task.displayPrompt || task.prompt;
  $('#task-instruction').textContent = task.instruction;
  $('#task-feedback').hidden = true;
  $('#task-feedback').classList.remove('bad');
  $('#transcript-box').hidden = true;
  $('#voice-answer').hidden = task.mode === 'listen';
  renderAnswerArea(task);
  const spoken = await state.voice.speak(task.prompt);
  if (state.currentTask?.id !== task.id) return;
  state.promptEndedAt = spoken.endedAt || performance.now();
  state.currentTrial.promptEndedAt = state.promptEndedAt;
  $('#task-state').textContent = task.mode === 'listen' ? 'ENCODE' : 'YOUR TURN';
  appendEvent(state.session, 'prompt-end', { taskId: task.id, provider: spoken.provider });

  if (task.mode === 'listen') {
    window.setTimeout(() => answerCurrentTask('encoded', { responseMs: null, timingMethod: 'none', provider: spoken.provider }), 700);
  } else if (state.autoDemo) {
    const delay = task.mode === 'free' || task.mode === 'recall' ? 1450 : 1150;
    window.setTimeout(() => {
      if (state.currentTask?.id === task.id) {
        const response = demoResponse(task);
        answerCurrentTask(response, { responseMs: demoResponseTime(task), timingMethod: 'synthetic', provider: 'demo' });
      }
    }, delay);
  }
}

function renderAnswerArea(task) {
  const area = $('#answer-area');
  area.replaceChildren();
  if (task.mode === 'listen') {
    const message = document.createElement('div');
    message.className = 'transcript-box';
    message.innerHTML = '<span>MEMORY ENCODING</span><strong>Keep these words in mind for later.</strong>';
    area.appendChild(message);
    return;
  }
  if (task.mode === 'binary') {
    const grid = document.createElement('div');
    grid.className = 'binary-grid';
    for (const value of ['True', 'False']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-choice';
      button.textContent = value;
      button.addEventListener('click', () => answerCurrentTask(value, { timingMethod: 'tap', provider: 'manual' }));
      grid.appendChild(button);
    }
    area.appendChild(grid);
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'answer-input';
  const input = task.mode === 'free' || task.mode === 'recall' ? document.createElement('textarea') : document.createElement('input');
  input.id = 'manual-answer-input';
  input.placeholder = task.mode === 'digits' ? 'Type the reversed digits' : 'Type or say your answer';
  if (task.mode === 'digits') input.inputMode = 'numeric';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Submit';
  button.addEventListener('click', () => answerCurrentTask(input.value, { timingMethod: 'typed', provider: 'manual' }));
  wrapper.append(input, button);
  area.appendChild(wrapper);
}

function demoResponse(task) {
  if (task.mode === 'binary') return task.condition === 'zone3' ? String(!task.answer) : String(task.answer);
  if (task.mode === 'digits') return task.condition === 'zone3' ? String(task.answer).slice(0, -1) : task.answer;
  if (task.mode === 'recall') {
    const take = task.condition === 'recovery0' ? task.answer.length - 1 : task.answer.length;
    return task.answer.slice(0, take).join(' ');
  }
  if (task.mode === 'free') {
    const ideas = {
      seated: 'door stop, plant pot, phone stand, paper weight',
      walking: 'bird feeder, tiny drum, seed scoop, lamp shade, mini goal, cable holder, sculpture',
      recovery5: 'plant irrigator, sound shaker, desk organiser, funnel, lantern shade',
    };
    return ideas[task.condition] || 'container, marker, holder, decoration';
  }
  return 'encoded';
}

function demoResponseTime(task) {
  return ({ seated: 1880, standing: 1690, walking: 1510, zone2: 1390, zone3: 2640, recovery0: 1460, recovery5: 1580 })[task.condition] || 1800;
}

async function listenForAnswer() {
  if (!state.currentTask || state.currentTask.mode === 'listen') return;
  const button = $('#voice-answer');
  button.disabled = true;
  button.textContent = 'Listening…';
  try {
    const result = await state.voice.listen({ promptEndedAt: state.promptEndedAt });
    if (!state.currentTask) return;
    $('#transcript-text').textContent = result.transcript;
    $('#transcript-confidence').textContent = Number.isFinite(result.confidence) ? `${Math.round(result.confidence * 100)}% voice confidence` : result.provider;
    $('#transcript-box').hidden = false;
    await answerCurrentTask(result.transcript, result);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="mic-icon"></span> Answer by voice';
  }
}

async function answerCurrentTask(value, meta = {}) {
  const task = state.currentTask;
  const trial = state.currentTrial;
  if (!task || !trial || trial.outcome) return;
  const responseMs = meta.responseMs ?? Math.max(0, performance.now() - (state.promptEndedAt || trial.promptStartedAt));
  const outcome = scoreTask(task, value, responseMs, meta);
  trial.response = {
    transcript: String(value ?? ''),
    confidence: meta.confidence ?? null,
    provider: meta.provider || 'manual',
    timingMethod: meta.timingMethod || 'manual',
    responseMs,
  };
  trial.responseAt = performance.now();
  trial.telemetryWindow.speedDuring = average(state.taskSpeedSamples);
  trial.outcome = outcome;
  trial.motorCost = calculateMotorCost(trial);
  addTrial(state.session, trial);
  appendEvent(state.session, 'response-commit', {
    taskId: task.id,
    usable: outcome.usable,
    correct: outcome.correct,
    responseMs: outcome.responseMs,
    provider: trial.response.provider,
  });
  $('#live-trials').textContent = state.session.trials.filter((item) => item.outcome?.usable && item.task.mode !== 'listen').length;
  const feedback = $('#task-feedback');
  feedback.hidden = false;
  feedback.classList.toggle('bad', outcome.correct === false || !outcome.usable);
  feedback.textContent = outcome.label;
  if (meta.provider && meta.provider !== 'manual' && meta.provider !== 'demo') {
    $('#transcript-text').textContent = String(value);
    $('#transcript-confidence').textContent = Number.isFinite(meta.confidence) ? `${Math.round(meta.confidence * 100)}% voice confidence` : meta.provider;
    $('#transcript-box').hidden = false;
  }
  state.telemetry.setCognitiveLoad(0);
  try { navigator.vibrate?.(outcome.correct === false ? [60, 40, 60] : 80); } catch { /* optional */ }
  window.setTimeout(closeTask, task.mode === 'listen' ? 500 : 900);
}

function closeTask() {
  $('#task-card').hidden = true;
  $('#eyes-forward').hidden = false;
  $('.session-main').classList.remove('task-open');
  state.currentTask = null;
  state.currentTrial = null;
  state.taskSpeedSamples = [];
  if (state.taskQueue.length) presentTask(state.taskQueue.shift());
  else if (state.protocolEnded) finishSession();
}

function updateLiveUi() {
  if (!state.machine?.stage) return;
  const stage = state.machine.stage;
  const sample = state.telemetry.lastSample;
  const remaining = stage.duration - state.machine.stageElapsed;
  $('#stage-clock').textContent = formatClock(remaining);
  $('#session-progress').style.width = `${Math.round(state.machine.progress() * 1000) / 10}%`;
  $('#session-source').textContent = state.telemetry.status().toUpperCase();
  if (!sample) return;
  $('#live-hr').textContent = sample.hrBpm;
  $('#live-zone').textContent = sample.zone.label;
  $('#live-distance').textContent = (sample.distanceM / 1000).toFixed(2);
  $('#live-pace').textContent = formatPace(sample.paceSecPerKm);
  $('#live-cadence').textContent = sample.cadenceSpm || '—';
  $('#target-state').textContent = sample.targetHr ? (sample.onTarget ? 'In target range' : 'Building toward target') : 'Recovery measurement';
  const circumference = 2 * Math.PI * 92;
  const fraction = Math.min(1, Math.max(0, (sample.hrBpm - state.participant.restingHr + 5) / (state.participant.maxHr - state.participant.restingHr + 10)));
  $('#dial-progress').style.strokeDashoffset = String(circumference * (1 - fraction));
  $('#dial-progress').style.stroke = sample.onTarget ? stage.colour : 'var(--heart)';
  drawTelemetrySparkline($('#telemetry-spark'), state.session.telemetry, state.participant);
}

function pauseSession() {
  if (!state.machine) return;
  if (state.machine.status === 'running') {
    state.machine.pause();
    $('#pause-session').textContent = 'Resume';
    appendEvent(state.session, 'session-pause');
    state.voice.speak('Session paused.');
  } else if (state.machine.status === 'paused') {
    state.machine.resume();
    state.lastFrameAt = performance.now();
    $('#pause-session').textContent = 'Pause';
    appendEvent(state.session, 'session-resume');
    state.voice.speak('Session resumed. Re-establish your current condition.');
  }
}

function skipStage() {
  if (!state.machine) return;
  appendEvent(state.session, 'stage-skip', { stageId: state.machine.stage?.id });
  handleProtocolEvents(state.machine.skipStage());
}

function safeStop() {
  if (!state.session || state.finishing) return;
  appendEvent(state.session, 'safe-stop', { stageId: state.machine?.stage?.id });
  state.session.status = 'safe-stop';
  state.protocolEnded = true;
  state.taskQueue = [];
  if (state.currentTask) {
    state.currentTask = null;
    state.currentTrial = null;
  }
  finishSession(true);
}

async function finishSession(partial = false) {
  if (state.finishing || !state.session) return;
  state.finishing = true;
  cancelAnimationFrame(state.loopHandle);
  state.telemetry.setCognitiveLoad(0);
  appendEvent(state.session, partial ? 'partial-complete' : 'protocol-complete');
  state.results = computeSessionResults(state.session);
  state.session.results = state.results;
  if (partial) state.session.status = 'safe-stop';
  completeSession(state.session);
  await state.telemetry.stop().catch(() => {});
  renderResults(state.results, { session: state.session, partial });
  showView('results');
}

function renderResults(results, { preview = false, session = state.session, partial = false } = {}) {
  state.results = preview ? null : results;
  const primary = results.primary || results.bestByDomain?.creativity;
  renderDomainTabs(results);
  const domainPoints = results.curves[state.activeDomain] || [];
  const best = results.bestByDomain?.[state.activeDomain]
    || [...domainPoints].filter((point) => Number.isFinite(point.index)).sort((a, b) => b.index - a.index)[0]
    || primary;
  const bestCondition = best?.condition ? conditionLabel(best.condition) : 'More data needed';
  const lift = Number.isFinite(best?.index) ? best.index - 100 : null;
  $('#result-confidence').textContent = preview ? 'PREVIEW · SYNTHETIC EXAMPLE' : `${results.confidence.toUpperCase()} · SESSION 1`;
  $('#result-title').textContent = best
    ? `Your strongest ${domainLabel(state.activeDomain).toLowerCase()} signal: ${bestCondition}.`
    : 'Your first brainprint needs more trials.';
  $('#result-summary').textContent = lift == null
    ? 'Repeat the incomplete conditions to build a comparable curve.'
    : `${domainLabel(state.activeDomain)} was ${Math.abs(lift)} index points ${lift >= 0 ? 'above' : 'below'} its baseline reference.`;
  const provenance = $('#result-provenance');
  provenance.replaceChildren();
  const sources = preview ? ['ROXFIT body state', 'ElevenLabs voice', 'Synthetic preview'] : [state.telemetry?.status() || 'ROXFIT sandbox', state.voice?.label() || 'Voice', `${results.usableCount}/${results.totalScorable} usable trials`];
  sources.forEach((source, index) => {
    const chip = document.createElement('span');
    chip.textContent = source;
    if (preview || session?.synthetic && index === 0) chip.classList.add('synthetic');
    provenance.appendChild(chip);
  });
  if (partial) {
    const chip = document.createElement('span');
    chip.className = 'synthetic';
    chip.textContent = 'Partial safety-stop result';
    provenance.appendChild(chip);
  }

  drawConditionCurve($('#condition-curve'), domainPoints);
  $('#best-zone').textContent = best ? conditionLabel(best.condition) : 'More data';
  $('#best-zone-copy').textContent = best ? `${domainLabel(state.activeDomain)} index ${best.index}. Early signal until repeated.` : 'No comparable domain data yet.';
  $('#breakpoint-zone').textContent = results.breakpoint ? conditionLabel(results.breakpoint.condition) : 'Not detected';
  $('#breakpoint-copy').textContent = results.breakpoint ? `Logic index fell to ${results.breakpoint.index} in the ascending scan.` : 'No clear ≥8-point decline below baseline.';
  $('#recovery-window').textContent = results.recoveryBest ? conditionLabel(results.recoveryBest.condition) : 'More data';
  $('#recovery-copy').textContent = results.recoveryBest ? `Recall index ${results.recoveryBest.index} at this recovery point.` : 'Complete immediate and +5-minute recall.';
  $('#motor-cost').textContent = Number.isFinite(results.motorCost) ? `${results.motorCost.toFixed(1)}% slower` : 'Not available';
  $('#motor-copy').textContent = Number.isFinite(results.motorCost) ? 'Median speed change while answering during movement.' : 'Needs live movement samples around a task.';
  $('#recommendation-title').textContent = best ? `Try a ${conditionLabel(best.condition)} ${domainLabel(state.activeDomain)} session.` : 'Repeat the full scan.';
  $('#recommendation-copy').textContent = preview ? 'This is an example of the recommendation produced after a completed scan.' : 'One session is an early signal. Repeat twice before treating it as a personal pattern.';
  renderRawTrials(session, preview);
}

function renderDomainTabs(results) {
  const container = $('#domain-tabs');
  container.replaceChildren();
  if (!results.curves[state.activeDomain]?.length) {
    state.activeDomain = Object.keys(results.curves).find((domain) => results.curves[domain]?.length) || 'reasoning';
  }
  for (const domain of ['creativity', 'reasoning', 'workingMemory', 'memory']) {
    if (!results.curves[domain]?.length) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = domainLabel(domain);
    button.classList.toggle('active', state.activeDomain === domain);
    button.addEventListener('click', () => {
      state.activeDomain = domain;
      renderResults(results, { preview: !state.session || results === SAMPLE_RESULTS, session: state.session });
    });
    container.appendChild(button);
  }
}

function renderRawTrials(session, preview) {
  const body = $('#raw-trials');
  body.replaceChildren();
  if (preview || !session?.trials?.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = preview ? 'Preview only — complete a scan to inspect timestamped trials.' : 'No trials recorded.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  session.trials.filter((trial) => trial.task.mode !== 'listen').forEach((trial) => {
    const row = document.createElement('tr');
    const values = [
      trial.recoveryOffsetSec == null
        ? conditionLabel(trial.condition)
        : `${conditionLabel(trial.condition)} (+${trial.recoveryOffsetSec}s)`,
      domainLabel(trial.task.domain),
      trial.outcome?.label || '—',
      Number.isFinite(trial.outcome?.responseMs) ? `${Math.round(trial.outcome.responseMs)} ms` : 'Accuracy only',
      Number.isFinite(trial.motorCost) ? `${trial.motorCost.toFixed(1)}%` : '—',
    ];
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function renderStudy() {
  drawCohortBars($('#cohort-bars'), SYNTHETIC_COHORT);
  const clusters = [
    ['WALKING CREATIVITY', 'Idea walkers', 'Divergent output rises during low-intensity movement.', 'var(--movement)'],
    ['POST-RUN MEMORY', 'Recovery responders', 'Recall peaks immediately or five minutes after effort.', 'var(--recovery)'],
    ['HIGH-LOAD DECLINE', 'Zone 3 decliners', 'Working memory falls as physical demand competes for attention.', 'var(--heart)'],
    ['PACE PROTECTION', 'Motor-cost responders', 'Accuracy stays stable because the participant slows down.', 'var(--cognition)'],
  ];
  $('#cluster-grid').replaceChildren(...clusters.map(([tag, title, copy, colour]) => {
    const card = document.createElement('article');
    card.className = 'cluster-card';
    card.style.setProperty('--cluster-colour', colour);
    card.innerHTML = `<span>${tag}</span><h3>${title}</h3><p>${copy}</p>`;
    return card;
  }));
}

function bindEvents() {
  $$('[data-nav]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.nav)));
  $('#start-scan').addEventListener('click', () => showView('setup'));
  $('#sample-study').addEventListener('click', () => showView('study'));
  $('#how-it-works').addEventListener('click', () => showView('setup'));
  $('#setup-form').addEventListener('submit', startSession);
  ['#participant-age', '#participant-rest', '#participant-max'].forEach((selector) => $(selector).addEventListener('input', updateZonePreview));
  $('#connect-hr').addEventListener('click', connectHeartRate);
  $('#connect-gps').addEventListener('click', connectGps);
  $('#enable-mic').addEventListener('click', enableMicrophone);
  $('#voice-answer').addEventListener('click', listenForAnswer);
  $('#repeat-prompt').addEventListener('click', () => state.currentTask && state.voice.speak(state.currentTask.prompt));
  $('#pause-session').addEventListener('click', pauseSession);
  $('#skip-stage').addEventListener('click', skipStage);
  $('#safe-stop').addEventListener('click', safeStop);
  $('#repeat-scan').addEventListener('click', () => showView('setup'));
  $('#view-study-results').addEventListener('click', () => showView('study'));
  $('#export-session').addEventListener('click', () => state.session ? downloadSession(state.session) : toast('Complete a session before exporting.'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.machine?.status === 'running') {
      appendEvent(state.session, 'app-backgrounded');
      persistActiveSession(state.session);
    }
  });
}

async function boot() {
  renderProtocol();
  renderStudy();
  bindEvents();
  await initialiseServices();
}

boot().catch((error) => {
  console.error(error);
  toast(`CogniRun could not initialise: ${error.message}`, 5000);
});
