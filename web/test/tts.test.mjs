import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { cancelSpeech, setVoiceEnabled, speak } from '../src/tts.js';

/** Minimal stand-in for the browser speech API used by the TTS module. */
function stubBrowser() {
  const spoken = [];
  const cancelled = [];
  globalThis.speechSynthesis = {
    speak: (u) => {
      spoken.push(u.text);
      u.onend?.();
    },
    cancel: () => cancelled.push(true),
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return { spoken, cancelled };
}

/**
 * The TTS module now tries ElevenLabs (fetch /api/tts) first and only falls back to
 * the browser voice. These tests exercise the browser fallback, so `fetch` is stubbed
 * to fail, forcing the fallback path deterministically.
 */
function stubFetchFails() {
  globalThis.fetch = async () => {
    throw new Error('no server in tests');
  };
}

afterEach(() => {
  setVoiceEnabled(true);
  delete globalThis.fetch;
});

test('the browser voice reads the question when ElevenLabs is unavailable', async () => {
  const { spoken } = stubBrowser();
  stubFetchFails();

  await speak('Why is the man bankrupt?');

  assert.deepEqual(spoken, ['Why is the man bankrupt?']);
});

test('a new question cancels whatever was being read', async () => {
  const { spoken, cancelled } = stubBrowser();
  stubFetchFails();

  await speak('First question.');
  await speak('Second question.');

  assert.deepEqual(spoken, ['First question.', 'Second question.']);
  // Each speak() cancels the previous read before starting the next.
  assert.ok(cancelled.length >= 2);
});

test('cancelling silences the browser voice', () => {
  const { cancelled } = stubBrowser();

  cancelSpeech();

  assert.equal(cancelled.length, 1);
});

test('the voice toggle silences read-aloud', async () => {
  const { spoken } = stubBrowser();
  stubFetchFails();
  setVoiceEnabled(false);

  await speak('Should stay silent.');

  assert.deepEqual(spoken, []);
});

test('a browser without speech synthesis stays silent instead of throwing', async () => {
  stubBrowser();
  stubFetchFails();
  delete globalThis.SpeechSynthesisUtterance;

  await assert.doesNotReject(speak('No voice available.'));
});
