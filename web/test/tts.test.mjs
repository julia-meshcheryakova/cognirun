import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { cancelSpeech, setVoiceEnabled, speak } from '../src/tts.js';

/** Minimal stand-in for the browser speech API used by the TTS module. */
function stubBrowser() {
  const spoken = [];
  const cancelled = [];
  globalThis.speechSynthesis = {
    speak: (u) => spoken.push(u.text),
    cancel: () => cancelled.push(true),
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return { spoken, cancelled };
}

afterEach(() => {
  setVoiceEnabled(true);
});

test('the browser voice reads the question', () => {
  const { spoken } = stubBrowser();

  speak('Why is the man bankrupt?');

  assert.deepEqual(spoken, ['Why is the man bankrupt?']);
});

test('a new question cancels whatever was being read', () => {
  const { spoken, cancelled } = stubBrowser();

  speak('First question.');
  speak('Second question.');

  assert.deepEqual(spoken, ['First question.', 'Second question.']);
  assert.equal(cancelled.length, 2);
});

test('cancelling silences the browser voice', () => {
  const { cancelled } = stubBrowser();

  cancelSpeech();

  assert.equal(cancelled.length, 1);
});

test('the voice toggle silences read-aloud', () => {
  const { spoken } = stubBrowser();
  setVoiceEnabled(false);

  speak('Should stay silent.');

  assert.deepEqual(spoken, []);
});

test('a browser without speech synthesis stays silent instead of throwing', () => {
  stubBrowser();
  delete globalThis.SpeechSynthesisUtterance;

  assert.doesNotThrow(() => speak('No voice available.'));
});
