function browserSpeechAvailable() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await response.text() || `Request failed (${response.status})`);
  return response.json();
}

export class VoiceEngine {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus;
    this.config = { elevenLabs: false };
    this.stream = null;
    this.audio = null;
    this.mode = 'browser';
  }

  async initialise() {
    try {
      this.config = await getJson('/api/config');
      this.mode = this.config.elevenLabs ? 'elevenlabs' : (browserSpeechAvailable() ? 'browser' : 'manual');
    } catch {
      this.mode = browserSpeechAvailable() || 'speechSynthesis' in window ? 'browser' : 'manual';
    }
    this.onStatus?.('ready', this.label());
    return this.mode;
  }

  label() {
    if (this.mode === 'elevenlabs') return 'ElevenLabs live';
    if (this.mode === 'browser') return 'Browser voice fallback';
    return 'Tap answers';
  }

  async primeMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.onStatus?.('ready', `${this.label()} · mic ready`);
    return true;
  }

  async speak(text) {
    this.onStatus?.('speaking', 'Speaking');
    if (this.mode === 'elevenlabs') {
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) throw new Error(await response.text());
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        await this.#playAudio(url);
        URL.revokeObjectURL(url);
        this.onStatus?.('ready', this.label());
        return { provider: 'elevenlabs', endedAt: performance.now() };
      } catch (error) {
        this.onStatus?.('fallback', 'ElevenLabs unavailable · browser voice');
      }
    }
    await this.#speakBrowser(text);
    this.onStatus?.('ready', this.label());
    return { provider: 'browser', endedAt: performance.now() };
  }

  #playAudio(url) {
    return new Promise((resolve, reject) => {
      this.audio?.pause?.();
      this.audio = new Audio(url);
      this.audio.onended = resolve;
      this.audio.onerror = () => reject(new Error('Audio playback failed.'));
      this.audio.play().catch(reject);
    });
  }

  #speakBrowser(text) {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-GB';
      utterance.rate = 1.02;
      utterance.pitch = 0.98;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
      window.setTimeout(resolve, Math.max(1800, text.length * 85));
    });
  }

  async listen({ promptEndedAt = performance.now(), timeoutMs = 9000 } = {}) {
    this.onStatus?.('listening', 'Listening');
    if (this.mode === 'elevenlabs') {
      try {
        const result = await this.#recordAndTranscribe({ promptEndedAt, timeoutMs });
        this.onStatus?.('ready', this.label());
        return result;
      } catch (error) {
        this.onStatus?.('fallback', 'Voice failed · use the tap answer');
        throw error;
      }
    }
    if (browserSpeechAvailable()) {
      const result = await this.#browserRecognise({ promptEndedAt, timeoutMs });
      this.onStatus?.('ready', this.label());
      return result;
    }
    throw new Error('Voice recognition is not available. Use the on-screen answer.');
  }

  async #recordAndTranscribe({ promptEndedAt, timeoutMs }) {
    if (!this.stream) await this.primeMicrophone();
    const supported = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      .find((type) => window.MediaRecorder?.isTypeSupported?.(type));
    if (!window.MediaRecorder) throw new Error('Audio recording is not supported.');
    const recorder = new MediaRecorder(this.stream, supported ? { mimeType: supported } : undefined);
    const chunks = [];
    let onsetAt = null;
    let speechSeenAt = null;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(this.stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };

    const blob = await new Promise((resolve, reject) => {
      let raf = 0;
      let timeout = 0;
      recorder.onerror = (event) => reject(event.error || new Error('Recording failed.'));
      recorder.onstop = () => {
        cancelAnimationFrame(raf);
        clearTimeout(timeout);
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      const inspect = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          energy += centred * centred;
        }
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms > 0.045) {
          onsetAt ??= now;
          speechSeenAt = now;
        }
        if (onsetAt && speechSeenAt && now - speechSeenAt > 900 && recorder.state === 'recording') recorder.stop();
        else if (recorder.state === 'recording') raf = requestAnimationFrame(inspect);
      };
      recorder.start(180);
      raf = requestAnimationFrame(inspect);
      timeout = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, timeoutMs);
    });
    await audioContext.close().catch(() => {});
    if (!blob.size) throw new Error('No audio was captured.');
    this.onStatus?.('processing', 'Transcribing with ElevenLabs');
    const response = await fetch('/api/stt', {
      method: 'POST',
      headers: {
        'content-type': blob.type || 'application/octet-stream',
        'x-audio-filename': blob.type.includes('mp4') ? 'answer.m4a' : 'answer.webm',
      },
      body: blob,
    });
    if (!response.ok) throw new Error(await response.text() || 'Transcription failed.');
    const result = await response.json();
    const wordProbabilities = (result.words || [])
      .map((word) => Number.isFinite(word.logprob) ? Math.exp(word.logprob) : null)
      .filter(Number.isFinite);
    const confidence = wordProbabilities.length
      ? wordProbabilities.reduce((sum, value) => sum + value, 0) / wordProbabilities.length
      : result.language_probability;
    return {
      transcript: result.text || '',
      confidence,
      responseMs: onsetAt ? Math.max(0, onsetAt - promptEndedAt) : null,
      voiceOnsetAt: onsetAt,
      committedAt: performance.now(),
      timingMethod: onsetAt ? 'local-vad' : 'commit-only',
      provider: 'elevenlabs',
    };
  }

  #browserRecognise({ promptEndedAt, timeoutMs }) {
    return new Promise((resolve, reject) => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new Recognition();
      recognition.lang = 'en-GB';
      recognition.interimResults = true;
      recognition.continuous = false;
      let onsetAt = null;
      let transcript = '';
      let confidence = null;
      const timeout = window.setTimeout(() => {
        recognition.abort();
        reject(new Error('No voice response detected.'));
      }, timeoutMs);
      recognition.onspeechstart = () => { onsetAt = performance.now(); };
      recognition.onresult = (event) => {
        const latest = event.results[event.results.length - 1];
        transcript = latest[0]?.transcript || transcript;
        confidence = latest[0]?.confidence || confidence;
      };
      recognition.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.error || 'Speech recognition failed.'));
      };
      recognition.onend = () => {
        clearTimeout(timeout);
        if (!transcript) return reject(new Error('No voice response detected.'));
        resolve({
          transcript,
          confidence,
          responseMs: onsetAt ? Math.max(0, onsetAt - promptEndedAt) : null,
          voiceOnsetAt: onsetAt,
          committedAt: performance.now(),
          timingMethod: onsetAt ? 'speech-start' : 'commit-only',
          provider: 'browser',
        });
      };
      recognition.start();
    });
  }

  stop() {
    window.speechSynthesis?.cancel?.();
    this.audio?.pause?.();
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.stream = null;
  }
}
