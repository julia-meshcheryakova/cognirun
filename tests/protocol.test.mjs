import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocolMachine,
  computeHeartRateProfile,
  createProtocol,
  hrZoneFor,
} from '../www/js/protocol.js';

test('personal heart-rate reserve creates reproducible Zone 2 and Zone 3 ranges', () => {
  const profile = computeHeartRateProfile({ age: 28, restingHr: 62, maxHr: 190 });
  assert.deepEqual(profile.zones.zone2, [139, 152]);
  assert.deepEqual(profile.zones.zone3, [152, 164]);
  assert.equal(profile.source, 'user');
  assert.equal(hrZoneFor(145, profile).id, 'zone2');
});

test('estimated maximum is marked as estimated', () => {
  const profile = computeHeartRateProfile({ age: 30, restingHr: 60 });
  assert.equal(profile.maxHr, 187);
  assert.equal(profile.source, 'estimated');
});

test('same seed creates the same task assignment', () => {
  const first = createProtocol({ seed: 20260829 });
  const second = createProtocol({ seed: 20260829 });
  assert.deepEqual(first.stages.flatMap((stage) => stage.tasks.map((task) => task.prompt)), second.stages.flatMap((stage) => stage.tasks.map((task) => task.prompt)));
});

test('the five-minute recall is anchored to exercise stop', () => {
  const protocol = createProtocol({ seed: 20260829 });
  const immediate = protocol.stages.find((stage) => stage.id === 'recovery0');
  const timedRecovery = protocol.stages.find((stage) => stage.id === 'recovery5');
  const recall = timedRecovery.tasks.find((task) => task.id === 'five-recall');
  assert.equal(immediate.duration + recall.triggerAt, 300);
});

test('protocol machine emits every task once and completes', () => {
  const protocol = createProtocol({ seed: 42 });
  const machine = new ProtocolMachine(protocol);
  const events = [...machine.start()];
  for (let index = 0; index < protocol.totalDuration + 10; index += 1) events.push(...machine.tick(1));
  assert.equal(machine.status, 'complete');
  const taskEvents = events.filter((event) => event.type === 'task-due');
  const expected = protocol.stages.reduce((sum, stage) => sum + stage.tasks.length, 0);
  assert.equal(taskEvents.length, expected);
  assert.equal(new Set(taskEvents.map((event) => event.task.id)).size, expected);
  assert.equal(events.filter((event) => event.type === 'protocol-complete').length, 1);
});

test('skipping a stage records it and advances safely', () => {
  const machine = new ProtocolMachine(createProtocol({ seed: 7 }));
  machine.start();
  const events = machine.skipStage('safety');
  assert.equal(machine.stageIndex, 1);
  assert.equal(machine.stageResults[0].skipped, true);
  assert.equal(events.at(-1).type, 'stage-enter');
});
