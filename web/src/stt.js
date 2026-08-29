import { elevenLabsApiKey } from './keys.js';

const STT_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL_ID = 'scribe_v1'; // ElevenLabs "Scribe"
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
/** How long we wait for the browser recogniser to flush its last result. */
const RECOGNITION_FLUSH_MS = 1500;

function recognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
}

function recorderSupported() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
}

/**
 * Which speech-to-text path is available:
 * - `elevenlabs`: record with MediaRecorder, transcribe with the Scribe API.
 * - `browser`: the built-in Web Speech API (no key needed, Chromium only).
 * - `none`: no microphone input at all, the text box is the only way to answer.
 */
export function sttMode() {
  if (elevenLabsApiKey() && recorderSupported()) return 'elevenlabs';
  if (recognitionCtor()) return 'browser';
  return 'none';
}

export function sttAvailable() {
  return sttMode() !== 'none';
}

/** POSTs recorded audio to ElevenLabs Scribe and returns the transcript. */
export async function transcribeWithElevenLabs(
  blob,
  { key = elevenLabsApiKey(), fetchImpl = globalThis.fetch } = {},
) {
  if (!key) throw new Error('no ElevenLabs API key');
  const form = new FormData();
  form.append('model_id', MODEL_ID);
  form.append('file', blob, 'answer.webm');

  const response = await fetchImpl(STT_ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  if (!response.ok) throw new Error(`ElevenLabs STT responded ${response.status}`);
  const data = await response.json();
  return String(data?.text ?? '').trim();
}

async function startRecorderSession({ key, fetchImpl }) {
  const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
  const stopTracks = () => stream.getTracks?.().forEach((track) => track.stop());

  let recorder;
  const chunks = [];
  let stopped;
  try {
    const mimeType = MIME_CANDIDATES.find((type) =>
      globalThis.MediaRecorder.isTypeSupported?.(type),
    );
    recorder = new globalThis.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve));
    recorder.start();
  } catch (err) {
    // Never hold the microphone open when the session failed to start.
    stopTracks();
    throw err;
  }

  const release = () => {
    if (recorder.state !== 'inactive') recorder.stop();
    stopTracks();
  };

  return {
    mode: 'elevenlabs',
    async stop() {
      release();
      await stopped;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) return '';
      return transcribeWithElevenLabs(blob, { key, fetchImpl });
    },
    cancel() {
      try {
        release();
      } catch (err) {
        console.warn('stopping the microphone failed', err);
      }
    },
  };
}

function startRecognitionSession() {
  const Recognition = recognitionCtor();
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;

  let transcript = '';
  recognition.addEventListener('result', (event) => {
    transcript = Array.from(event.results ?? [])
      .map((result) => result[0]?.transcript ?? '')
      .join(' ');
  });
  const settled = new Promise((resolve) => {
    recognition.addEventListener('end', resolve);
    recognition.addEventListener('error', resolve);
  });
  recognition.start();

  return {
    mode: 'browser',
    async stop() {
      recognition.stop();
      await Promise.race([
        settled,
        new Promise((resolve) => setTimeout(resolve, RECOGNITION_FLUSH_MS)),
      ]);
      return transcript.trim();
    },
    cancel() {
      try {
        recognition.abort?.();
      } catch (err) {
        console.warn('aborting speech recognition failed', err);
      }
    },
  };
}

/**
 * Opens the microphone and returns a session: `stop()` resolves with the
 * transcribed answer, `cancel()` drops the recording without transcribing.
 */
export async function startListening({ mode = sttMode(), key, fetchImpl } = {}) {
  if (mode === 'elevenlabs') return startRecorderSession({ key, fetchImpl });
  if (mode === 'browser') return startRecognitionSession();
  throw new Error('no speech input available');
}
