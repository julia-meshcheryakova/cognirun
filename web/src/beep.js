let ctx;

function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Short double beep signalling that a question is available. */
export function beep() {
  try {
    const ac = audioContext();
    [0, 0.25].forEach((offset) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + 0.18);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + offset);
      osc.stop(ac.currentTime + offset + 0.2);
    });
  } catch (err) {
    console.warn('beep failed', err);
  }
}
