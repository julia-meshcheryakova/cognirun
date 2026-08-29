import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { cancelListening, isSpeechToTextSupported, listenOnce } from '../src/stt.js';

/** Minimal stand-in for the browser SpeechRecognition API. */
function stubRecognition({ key = 'SpeechRecognition', onStart } = {}) {
  const instances = [];
  globalThis[key] = class {
    constructor() {
      this.started = false;
      this.aborted = false;
      instances.push(this);
    }
    start() {
      this.started = true;
      onStart?.(this);
    }
    abort() {
      this.aborted = true;
      this.onend?.();
    }
    emitResult(alternatives, isFinal = true) {
      this.onresult?.({
        resultIndex: 0,
        results: [Object.assign([alternatives], { isFinal })],
      });
    }
  };
  return instances;
}

afterEach(() => {
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
});

test('an unsupported browser resolves instead of throwing', async () => {
  assert.equal(isSpeechToTextSupported(), false);

  assert.deepEqual(await listenOnce(), {
    supported: false,
    transcript: '',
    confidence: 0,
    reason: 'unsupported',
  });
});

test('the webkit-prefixed API is used when the standard one is missing', async () => {
  const instances = stubRecognition({
    key: 'webkitSpeechRecognition',
    onStart: (r) => {
      r.emitResult({ transcript: 'the man is bankrupt', confidence: 0.9 });
      r.onend();
    },
  });

  assert.equal(isSpeechToTextSupported(), true);
  const result = await listenOnce();

  assert.deepEqual(result, {
    supported: true,
    transcript: 'the man is bankrupt',
    confidence: 0.9,
    reason: null,
  });
  assert.equal(instances.length, 1);
});

test('interim transcripts are reported through the callback', async () => {
  const interim = [];
  stubRecognition({
    onStart: (r) => {
      r.emitResult({ transcript: 'the man' }, false);
      r.emitResult({ transcript: 'the man is bankrupt', confidence: 0.5 });
      r.onend();
    },
  });

  const result = await listenOnce({ onInterim: (text) => interim.push(text) });

  assert.deepEqual(interim, ['the man']);
  assert.equal(result.transcript, 'the man is bankrupt');
});

test('a recognition error resolves with an empty transcript and the reason', async () => {
  stubRecognition({
    onStart: (r) => {
      r.onerror({ error: 'not-allowed' });
      r.onend();
    },
  });

  const result = await listenOnce();

  assert.deepEqual(result, {
    supported: true,
    transcript: '',
    confidence: 0,
    reason: 'not-allowed',
  });
});

test('silence resolves with a no-speech reason', async () => {
  stubRecognition({ onStart: (r) => r.onend() });

  assert.equal((await listenOnce()).reason, 'no-speech');
});

test('cancelling ends the session and aborts the recognizer', async () => {
  const instances = stubRecognition();

  const pending = listenOnce();
  cancelListening();
  const result = await pending;

  assert.equal(instances[0].aborted, true);
  assert.equal(result.transcript, '');
});
