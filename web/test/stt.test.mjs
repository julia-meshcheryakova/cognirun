import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { listenOnce, startListening, sttMode } from '../src/stt.js';
import { speak } from '../src/tts.js';
import { judgeAnswer } from '../src/judge.js';

/**
 * Minimal stand-in for the recogniser `startListening` drives: `speak()` delivers a
 * final result, and `stop()` ends the session like the browser does.
 */
function stubSessionRecognition({ key = 'SpeechRecognition' } = {}) {
  const state = { started: false, aborted: false, instance: null };
  globalThis[key] = class {
    constructor() {
      this.listeners = {};
      state.instance = this;
    }
    addEventListener(type, handler) {
      (this.listeners[type] ??= []).push(handler);
    }
    emit(type, event) {
      this.listeners[type]?.forEach((handler) => handler(event));
    }
    speak(text) {
      this.emit('result', { results: [[{ transcript: text }]] });
    }
    start() {
      state.started = true;
    }
    stop() {
      setTimeout(() => this.emit('end', {}));
    }
    abort() {
      state.aborted = true;
    }
  };
  return state;
}

afterEach(() => {
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  delete globalThis.fetch;
});

test('a spoken answer is transcribed by the browser recogniser', async () => {
  const state = stubSessionRecognition();

  assert.equal(sttMode(), 'browser');
  const session = await startListening();
  state.instance.speak('the capital is Tokyo');
  const transcript = await session.stop();

  assert.equal(state.started, true);
  assert.equal(transcript, 'the capital is Tokyo');
});

test('the webkit-prefixed recogniser drives the mic session too', async () => {
  const state = stubSessionRecognition({ key: 'webkitSpeechRecognition' });

  assert.equal(sttMode(), 'browser');
  const session = await startListening();
  state.instance.speak('Tokyo');

  assert.equal(await session.stop(), 'Tokyo');
});

test('a recogniser that never ends still resolves, bounded by the flush timeout', async () => {
  stubSessionRecognition();
  globalThis.SpeechRecognition.prototype.stop = () => {}; // never fires `end`

  const session = await startListening();
  assert.equal(await session.stop(), '');
});

test('cancelling a mic session aborts the recogniser', async () => {
  const state = stubSessionRecognition();

  const session = await startListening();
  session.cancel();

  assert.equal(state.aborted, true);
});

test('the transcript flows into the judge, which grades the spoken sentence', async () => {
  const state = stubSessionRecognition();

  const session = await startListening();
  state.instance.speak('I think he is playing Monopoly');
  const transcript = await session.stop();
  const verdict = await judgeAnswer({
    question: { prompt: 'What game is he playing?', answer: 'Monopoly' },
    text: transcript,
  });

  assert.equal(verdict.correct, true);
  assert.equal(verdict.method, 'contains');
});

test('with no recogniser at all the mic cannot be opened', async () => {
  assert.equal(sttMode(), 'none');
  await assert.rejects(startListening(), /no speech input available/);
});

test('a recogniser that ends on its own still returns what it heard', async () => {
  const state = stubSessionRecognition();
  globalThis.SpeechRecognition.prototype.stop = () => {
    throw new Error('InvalidStateError');
  };

  const session = await startListening();
  state.instance.speak('Tokyo');
  state.instance.emit('end', {}); // silence ended the session before the stop tap

  assert.equal(await session.stop(), 'Tokyo');
});

test('with no recogniser listenOnce reports it instead of throwing', async () => {
  assert.deepEqual(await listenOnce(), {
    supported: false,
    transcript: '',
    confidence: 0,
    reason: 'unsupported',
  });
});

test('grading a spoken answer makes no network calls beyond the optional TTS probe', async () => {
  const state = stubSessionRecognition();
  const requests = [];
  // TTS now tries ElevenLabs first and falls back to the browser voice; the STT and
  // judging path must still stay fully offline.
  globalThis.fetch = async (url) => {
    requests.push(url);
    throw new Error('no server in tests');
  };
  globalThis.speechSynthesis = { speak: (u) => u.onend?.(), cancel() {} };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };

  await speak('What is the capital of Japan?');
  const session = await startListening();
  state.instance.speak('Tokyo');
  const transcript = await session.stop();
  const verdict = await judgeAnswer({
    question: { prompt: 'What is the capital of Japan?', answer: 'Tokyo' },
    text: transcript,
  });

  assert.equal(verdict.correct, true);
  // The browser recogniser path itself makes no fetches; only TTS probed the server.
  assert.deepEqual(
    requests.filter((url) => !String(url).includes('/api/tts')),
    [],
  );
});
