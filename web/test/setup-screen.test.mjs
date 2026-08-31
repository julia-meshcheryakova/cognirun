import assert from 'node:assert/strict';
import test from 'node:test';

import { MULTIPLIERS } from '../src/config.js';
import { setupMarkup } from '../src/ui/setup.js';
import { liveMarkup } from '../src/ui/live.js';

const demo = { demo: true, multiplier: 10, voice: true };
const live = { demo: false, multiplier: 10, voice: true };

test('the setup screen offers a demo toggle and course chips', () => {
  const markup = setupMarkup({ settings: demo });
  assert.match(markup, /id="demo-toggle" checked/);
  assert.match(markup, /id="start"/);
});

test('the setup screen shows the speed selector in demo mode only', () => {
  const markup = setupMarkup({ settings: demo });
  MULTIPLIERS.forEach((m) => assert.match(markup, new RegExp(`data-mult="${m}"`)));
  assert.match(markup, /id="speed-row"(?! hidden)/);

  const liveSetup = setupMarkup({ settings: live });
  assert.match(liveSetup, /id="speed-row" hidden/);
});

test('the selected multiplier is the active chip', () => {
  const markup = setupMarkup({ settings: { ...demo, multiplier: 100 } });
  assert.match(markup, /class="chip active" data-mult="100"/);
  assert.match(markup, /class="chip " data-mult="1000"/);
});

test('the run screen drops the speed bar and scrubber outside demo mode', () => {
  const demoRun = liveMarkup({ settings: demo });
  assert.match(demoRun, /data-mult="1000"/);
  assert.match(demoRun, /id="scrub"/);

  const liveRun = liveMarkup({ settings: live });
  assert.doesNotMatch(liveRun, /data-mult=/);
  assert.doesNotMatch(liveRun, /demo-controls/);
  assert.doesNotMatch(liveRun, /id="scrub"/);
});
