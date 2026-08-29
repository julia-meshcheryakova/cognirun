import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { QUESTION_LIBRARY } from '../../question-server/questions.js';
import { selectRunQuestions } from '../src/questions.js';
import { ANSWER_WINDOW_SECONDS, scoreForElapsed } from '../src/scoring.js';
import { cancelListening, listenOnce } from '../src/stt.js';

/**
 * Minimal stand-in for the browser SpeechRecognition API: `onStart` drives the
 * session by emitting results and ending it, the way Chrome does.
 */
function stubRecognition({ onStart } = {}) {
  const instances = [];
  globalThis.SpeechRecognition = class {
    constructor() {
      this.aborted = false;
      instances.push(this);
    }
    start() {
      onStart?.(this);
    }
    abort() {
      this.aborted = true;
      this.onend?.();
    }
    emit(alternatives, isFinal = true, resultIndex = 0) {
      this.onresult?.({
        resultIndex,
        results: [Object.assign([alternatives], { isFinal })],
      });
    }
  };
  return instances;
}

/** The transcript a speaker produced, as the question screen would receive it. */
async function transcribe(segments) {
  stubRecognition({
    onStart: (r) => {
      segments.forEach((segment) => r.emit(segment));
      r.onend();
    },
  });
  return listenOnce();
}

/** The matching rule the question screen applies to an answer (see ui/question.js). */
function matches(question, spoken) {
  return spoken.trim() === question.answer;
}

afterEach(() => {
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
});

test('a transcript is trimmed of the padding recognizers add', async () => {
  const result = await transcribe([{ transcript: '  Tokyo ', confidence: 0.8 }]);

  assert.equal(result.transcript, 'Tokyo');
  assert.equal(result.reason, null);
});

test('consecutive final segments join into one spoken answer', async () => {
  const result = await transcribe([
    { transcript: 'Leonardo', confidence: 0.4 },
    { transcript: 'da Vinci', confidence: 0.9 },
  ]);

  assert.equal(result.transcript, 'Leonardo da Vinci');
  // The confidence of the last final segment is the one reported.
  assert.equal(result.confidence, 0.9);
});

test('a whitespace-only transcript counts as silence, not an answer', async () => {
  const result = await transcribe([{ transcript: '   ', confidence: 0.1 }]);

  assert.equal(result.transcript, '');
  assert.equal(result.reason, 'no-speech');
});

test('segments before resultIndex are not re-appended', async () => {
  stubRecognition({
    onStart: (r) => {
      r.emit({ transcript: 'Pacific', confidence: 0.7 });
      // A second event repeats the results array but moves resultIndex past it.
      r.emit({ transcript: 'Pacific', confidence: 0.7 }, true, 1);
      r.onend();
    },
  });

  assert.equal((await listenOnce()).transcript, 'Pacific');
});

test('an empty alternatives list is skipped instead of throwing', async () => {
  stubRecognition({
    onStart: (r) => {
      r.onresult({ resultIndex: 0, results: [Object.assign([], { isFinal: true })] });
      r.emit({ transcript: 'Jupiter', confidence: 0.6 });
      r.onend();
    },
  });

  assert.equal((await listenOnce()).transcript, 'Jupiter');
});

test('a missing confidence reports zero rather than undefined', async () => {
  const result = await transcribe([{ transcript: '7' }]);

  assert.deepEqual(result, {
    supported: true,
    transcript: '7',
    confidence: 0,
    reason: null,
  });
});

test('a recognizer that cannot start resolves with start-failed', async () => {
  globalThis.SpeechRecognition = class {
    start() {
      throw new Error('InvalidStateError');
    }
    abort() {}
  };

  assert.deepEqual(await listenOnce(), {
    supported: true,
    transcript: '',
    confidence: 0,
    reason: 'start-failed',
  });
});

test('listening again abandons the previous session', async () => {
  const instances = stubRecognition();

  const first = listenOnce();
  const second = listenOnce();
  assert.equal(instances[0].aborted, true, 'the first recognizer is aborted');
  assert.equal((await first).transcript, '');

  cancelListening();
  await second;
  assert.equal(instances.length, 2);
});

test('spoken answers are matched against the questions of a run', async () => {
  const [trivia, logic, math] = selectRunQuestions(QUESTION_LIBRARY);

  for (const question of [trivia, logic, math]) {
    const heard = await transcribe([{ transcript: ` ${question.answer} `, confidence: 0.9 }]);
    assert.ok(matches(question, heard.transcript), `${question.id} should accept its own answer`);
  }

  const wrong = await transcribe([{ transcript: 'Silver', confidence: 0.9 }]);
  assert.equal(matches(trivia, wrong.transcript), false);
});

test('matching is case and punctuation sensitive, so recognizer casing decides', async () => {
  const gold = QUESTION_LIBRARY.questions.find((q) => q.id === 'trivia-1');

  const lowercase = await transcribe([{ transcript: 'au', confidence: 0.9 }]);
  assert.equal(lowercase.transcript, 'au');
  assert.equal(matches(gold, lowercase.transcript), false);

  const trailingStop = await transcribe([{ transcript: 'Au.', confidence: 0.9 }]);
  assert.equal(matches(gold, trailingStop.transcript), false);
});

test('a spoken answer scores on when it was said, not how it was heard', async () => {
  const spoken = await transcribe([{ transcript: 'Tokyo', confidence: 0.2 }]);

  assert.equal(spoken.transcript, 'Tokyo');
  assert.equal(scoreForElapsed(0), 100);
  assert.equal(scoreForElapsed(ANSWER_WINDOW_SECONDS), 50);
  assert.equal(scoreForElapsed(ANSWER_WINDOW_SECONDS + 0.5), 0);
});

test('listening once is one-shot, so the utterance itself ends the session', async () => {
  const instances = stubRecognition({ onStart: (r) => r.onend() });

  await listenOnce();

  assert.equal(instances[0].continuous, false, 'a continuous session would never end on its own');
});

test('interim transcripts reach onInterim without joining the answer', async () => {
  const partials = [];
  stubRecognition({
    onStart: (r) => {
      r.emit({ transcript: 'Tok' }, false);
      r.emit({ transcript: 'Tokyo', confidence: 0.9 });
      r.onend();
    },
  });

  const result = await listenOnce({ onInterim: (text) => partials.push(text) });

  assert.deepEqual(partials, ['Tok']);
  assert.equal(result.transcript, 'Tokyo');
});

test('the recognizer language follows the caller, defaulting to en-US', async () => {
  const instances = stubRecognition({ onStart: (r) => r.onend() });

  await listenOnce({ lang: 'fr-FR' });
  await listenOnce();

  assert.equal(instances[0].lang, 'fr-FR');
  assert.equal(instances[1].lang, 'en-US');
});
