import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { cancelSpeech, setVoiceEnabled, speak } from '../src/tts.js';

/** Minimal stand-ins for the browser speech/audio APIs used by the TTS module. */
function stubBrowser({ fetchImpl } = {}) {
  const spoken = [];
  globalThis.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel() {} };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return fetchImpl ? fetchImpl() : { ok: false, status: 401 };
  };
  globalThis.URL.createObjectURL = () => 'blob:audio';
  globalThis.URL.revokeObjectURL = () => {};
  const played = [];
  globalThis.Audio = class {
    play() {
      played.push(true);
      return Promise.resolve();
    }
    addEventListener() {}
    pause() {}
  };
  return { spoken, requests, played };
}

afterEach(() => {
  delete globalThis.COGNIRUN_ELEVENLABS_API_KEY;
  setVoiceEnabled(true);
});

test('without an ElevenLabs key the browser voice reads the question', async () => {
  const { spoken, requests } = stubBrowser();

  await speak('Why is the man bankrupt?');

  assert.deepEqual(spoken, ['Why is the man bankrupt?']);
  assert.equal(requests.length, 0);
});

test('with a key configured at runtime it calls the ElevenLabs API and plays the audio', async () => {
  const { spoken, requests, played } = stubBrowser({
    fetchImpl: () => ({ ok: true, blob: async () => 'mp3' }),
  });
  globalThis.COGNIRUN_ELEVENLABS_API_KEY = 'test-key';

  await speak('Two guards stand at two doors.');

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/.+/);
  assert.equal(requests[0].options.headers['xi-api-key'], 'test-key');
  assert.equal(JSON.parse(requests[0].options.body).text, 'Two guards stand at two doors.');
  assert.deepEqual(played, [true]);
  assert.deepEqual(spoken, []);
});

test('a failing ElevenLabs request falls back to the browser voice', async () => {
  const { spoken } = stubBrowser({ fetchImpl: () => ({ ok: false, status: 429 }) });
  globalThis.COGNIRUN_ELEVENLABS_API_KEY = 'test-key';

  await speak('Rate limited question.');

  assert.deepEqual(spoken, ['Rate limited question.']);
});

test('speech cancelled while the request is in flight never plays', async () => {
  const { spoken, played } = stubBrowser({
    fetchImpl: () => ({ ok: true, blob: async () => 'mp3' }),
  });
  globalThis.COGNIRUN_ELEVENLABS_API_KEY = 'test-key';

  const pending = speak('Question the runner already answered.');
  cancelSpeech();
  await pending;

  assert.deepEqual(played, []);
  assert.deepEqual(spoken, []);
});

test('the voice toggle silences both paths', async () => {
  const { spoken, requests } = stubBrowser();
  setVoiceEnabled(false);

  await speak('Should stay silent.');

  assert.deepEqual(spoken, []);
  assert.equal(requests.length, 0);
});
