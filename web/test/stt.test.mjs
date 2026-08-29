import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { startListening, sttMode, transcribeWithElevenLabs } from '../src/stt.js';
import { judgeAnswer } from '../src/judge.js';

/** Minimal stand-ins for the browser mic APIs the STT module records with. */
function stubRecorder({ chunks = ['audio-bytes'] } = {}) {
  const stopped = [];
  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped.push('track') }] }),
    },
  };
  globalThis.MediaRecorder = class {
    static isTypeSupported = () => true;
    constructor() {
      this.state = 'recording';
      this.mimeType = 'audio/webm';
      this.listeners = {};
    }
    addEventListener(type, handler) {
      (this.listeners[type] ??= []).push(handler);
    }
    emit(type, event) {
      this.listeners[type]?.forEach((handler) => handler(event));
    }
    start() {
      // The browser emits recorded audio asynchronously; do the same.
      setTimeout(() => chunks.forEach((chunk) => this.emit('dataavailable', { data: blob(chunk) })));
    }
    stop() {
      this.state = 'inactive';
      setTimeout(() => this.emit('stop', {}));
    }
  };
  return { stopped };
}

const blob = (text) => new Blob([text], { type: 'audio/webm' });

/** ElevenLabs Scribe stub: returns `text` for whatever audio it is given. */
function sttStub(text, { ok = true, status = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok, status, json: async () => ({ text }) };
  };
  return { fetchImpl, requests };
}

afterEach(() => {
  delete globalThis.navigator;
  delete globalThis.MediaRecorder;
  delete globalThis.SpeechRecognition;
  delete globalThis.COGNIRUN_ELEVENLABS_API_KEY;
});

test('recorded audio is sent to ElevenLabs Scribe and comes back as a transcript', async () => {
  const { fetchImpl, requests } = sttStub('  He is playing Monopoly.  ');

  const transcript = await transcribeWithElevenLabs(blob('audio'), {
    key: 'sk-test',
    fetchImpl,
  });

  assert.equal(transcript, 'He is playing Monopoly.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.elevenlabs.io/v1/speech-to-text');
  assert.equal(requests[0].options.headers['xi-api-key'], 'sk-test');
  assert.equal(requests[0].options.body.get('model_id'), 'scribe_v1');
  assert.ok(requests[0].options.body.get('file'));
  // Bounded so a hung Scribe request cannot freeze the answer window.
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('a failing STT request rejects so the UI can offer typing instead', async () => {
  const { fetchImpl } = sttStub('', { ok: false, status: 401 });

  await assert.rejects(
    transcribeWithElevenLabs(blob('audio'), { key: 'sk-test', fetchImpl }),
    /401/,
  );
});

test('the mic session records, transcribes and releases the microphone', async () => {
  const { stopped } = stubRecorder();
  const { fetchImpl } = sttStub('Tokyo');
  globalThis.COGNIRUN_ELEVENLABS_API_KEY = 'sk-test';

  assert.equal(sttMode(), 'elevenlabs');
  const session = await startListening({ fetchImpl });
  const transcript = await session.stop();

  assert.equal(transcript, 'Tokyo');
  assert.deepEqual(stopped, ['track']);
});

test('the transcript flows into the judge, which grades it semantically', async () => {
  stubRecorder();
  const stt = sttStub('I think he is playing Monopoly');
  globalThis.COGNIRUN_ELEVENLABS_API_KEY = 'sk-test';
  const judgeCalls = [];
  const judgeFetch = async (url, options) => {
    judgeCalls.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"correct": true, "reason": "Same meaning"}' } }],
      }),
    };
  };

  const session = await startListening({ fetchImpl: stt.fetchImpl });
  const transcript = await session.stop();
  const verdict = await judgeAnswer({
    question: { prompt: 'What game is he playing?', answer: 'Monopoly' },
    text: transcript,
    key: 'gsk-test',
    fetchImpl: judgeFetch,
  });

  assert.equal(verdict.correct, true);
  assert.equal(verdict.method, 'llm');
  assert.match(
    judgeCalls[0].messages[1].content,
    /<<<ANSWER\nI think he is playing Monopoly\nANSWER>>>/,
  );
});

test('with no ElevenLabs key the browser recogniser is used', async () => {
  let started = false;
  globalThis.SpeechRecognition = class {
    constructor() {
      this.listeners = {};
    }
    addEventListener(type, handler) {
      (this.listeners[type] ??= []).push(handler);
    }
    start() {
      started = true;
      setTimeout(() =>
        this.listeners.result?.forEach((handler) =>
          handler({ results: [[{ transcript: 'the capital is Tokyo' }]] }),
        ),
      );
    }
    stop() {
      setTimeout(() => this.listeners.end?.forEach((handler) => handler({})));
    }
  };

  assert.equal(sttMode(), 'browser');
  const session = await startListening();
  const transcript = await session.stop();

  assert.equal(started, true);
  assert.equal(transcript, 'the capital is Tokyo');
});

test('with neither path available the mic cannot be opened', async () => {
  assert.equal(sttMode(), 'none');
  await assert.rejects(startListening(), /no speech input available/);
});
