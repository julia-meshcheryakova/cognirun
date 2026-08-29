const TONE_MS = 180;
const GAP_MS = 250;
export const BEEP_DURATION_MS = GAP_MS + TONE_MS;

let ctx;

function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Creates/resumes the audio context from a user gesture, so the first milestone
 * beep is not swallowed by the browser autoplay policy.
 */
export function primeAudio() {
  try {
    audioContext();
  } catch (err) {
    console.warn('audio unavailable', err);
  }
}

/**
 * Short double beep signalling that a question is available.
 * Returns how long the beep lasts, so callers can chain audio after it.
 */
export function beep() {
  try {
    const ac = audioContext();
    [0, GAP_MS / 1000].forEach((offset) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + TONE_MS / 1000);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + offset);
      osc.stop(ac.currentTime + offset + TONE_MS / 1000 + 0.02);
    });
  } catch (err) {
    console.warn('beep failed', err);
  }
  return BEEP_DURATION_MS;
}
