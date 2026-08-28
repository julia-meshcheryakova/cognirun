/**
 * CogniRun — an original deterministic 40-second electronic advert score.
 * No packages, samples, downloads, speech, or third-party recordings required.
 * Run: node marketing/cognirun-ad/scripts/generate-audio.mjs
 * Output: public/audio/cognirun-original-score.wav (48 kHz stereo PCM16).
 * All sound is synthesized below; the musical arrangement is original.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const RATE = 48_000;
const SECONDS = 40;
const FRAMES = RATE * SECONDS;
const TAU = Math.PI * 2;
const left = new Float64Array(FRAMES);
const right = new Float64Array(FRAMES);
const musicL = new Float64Array(FRAMES);
const musicR = new Float64Array(FRAMES);
const kickTimes = [];
let randomState = 0xc0912026;
const noise = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x80000000 - 1;
};
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
const panGains = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];

function event(start, duration, sample, pan = 0, isMusic = false) {
  const first = Math.round(start * RATE);
  const count = Math.ceil(duration * RATE);
  const [pl, pr] = panGains(pan);
  const ll = isMusic ? musicL : left;
  const rr = isMusic ? musicR : right;
  for (let j = 0; j < count; j++) {
    const index = first + j;
    if (index < 0 || index >= FRAMES) continue;
    const value = sample(j / RATE, j, count);
    ll[index] += value * pl;
    rr[index] += value * pr;
  }
}

function kick(start, velocity = 1) {
  kickTimes.push(start);
  let noiseLow = 0;
  event(start, 0.39, (t) => {
    const phase = TAU * (46 * t + 105 * 0.018 * (1 - Math.exp(-t / 0.018)));
    const attack = 1 - Math.exp(-t / 0.0008);
    const body = Math.sin(phase) * Math.exp(-t / 0.108);
    noiseLow += 0.38 * (noise() - noiseLow);
    const click = noiseLow * Math.exp(-t / 0.0038) * 0.11;
    return (body + click) * attack * velocity * 0.68 * smooth((0.39 - t) / 0.025);
  });
}

function clap(start, velocity = 1, pan = 0.04) {
  let low = 0;
  let high = 0;
  event(start, 0.22, (t) => {
    const n = noise();
    low += 0.52 * (n - low);
    high += 0.15 * (low - high);
    const bursts = [0, 0.011, 0.024].reduce((sum, offset) =>
      sum + (t >= offset ? Math.exp(-(t - offset) / 0.007) : 0), 0);
    const tail = t > 0.025 ? Math.exp(-(t - 0.025) / 0.055) * 0.52 : 0;
    const body = Math.sin(TAU * 179 * t) * Math.exp(-t / 0.03) * 0.16;
    return ((low - high) * (bursts + tail) + body) * 0.27 * velocity
      * smooth(t / 0.0007) * smooth((0.22 - t) / 0.02);
  }, pan);
}

function hat(start, velocity = 1, open = false, pan = 0.25) {
  const duration = open ? 0.18 : 0.07;
  let low = 0;
  let high = 0;
  event(start, duration, (t) => {
    low += 0.64 * (noise() - low);
    high += 0.48 * (low - high);
    const metallic = Math.sin(TAU * 7127 * t) * Math.sin(TAU * 5171 * t) * 0.08;
    const envelope = Math.exp(-t / (open ? 0.048 : 0.017));
    return ((low - high) + metallic) * envelope * velocity * 0.23
      * smooth(t / 0.001) * smooth((duration - t) / 0.012);
  }, pan);
}

function click(start, velocity = 1, pan = -0.24) {
  event(start, 0.065, (t) => (Math.sin(TAU * 940 * t) * 0.56
    + Math.sin(TAU * 1461 * t) * 0.24) * Math.exp(-t / 0.008)
    * smooth(t / 0.0007) * velocity * 0.13, pan);
}

function bass(start, note, duration = 0.34, velocity = 1) {
  const f = hz(note);
  let filtered = 0;
  event(start, duration + 0.06, (t) => {
    const phase = TAU * f * t;
    const wave = Math.sin(phase) + 0.17 * Math.sin(phase * 2)
      + 0.095 * Math.sin(phase * 3) + 0.035 * Math.sin(phase * 5);
    filtered += 0.065 * (wave - filtered);
    const envelope = smooth(t / 0.009) * (0.58 + 0.42 * Math.exp(-t / 0.15))
      * smooth((duration + 0.06 - t) / 0.075);
    return Math.tanh(filtered * 1.2) * envelope * velocity * 0.24;
  }, 0, true);
}

function pad(start, notes, duration = 2.2, level = 1) {
  notes.forEach((note, index) => {
    const f = hz(note);
    const spread = [-0.65, 0.4, -0.25, 0.7][index % 4];
    event(start, duration, (t) => {
      const a = Math.sin(TAU * f * 0.9981 * t + 0.4 * index);
      const b = Math.sin(TAU * f * 1.0018 * t + 0.4 * index);
      const harmonic = Math.sin(TAU * f * 2 * t) * 0.16;
      const envelope = smooth(t / 0.16) * smooth((duration - t) / 0.45);
      return (a + b + harmonic) * envelope * level * 0.024;
    }, spread, true);
  });
}

function pluck(start, note, level = 1, pan = 0, delay = true) {
  const f = hz(note);
  const voice = (at, gain, stereo) => event(at, 0.72, (t) => {
    const phase = TAU * f * t;
    const fundamental = Math.sin(phase + Math.sin(phase * 2) * 0.32 * Math.exp(-t / 0.07));
    const color = Math.sin(phase * 2) * 0.18 * Math.exp(-t / 0.08)
      + Math.sin(phase * 3) * 0.045 * Math.exp(-t / 0.05);
    const envelope = smooth(t / 0.003) * Math.exp(-t / 0.16) * smooth((0.72 - t) / 0.08);
    return (fundamental + color) * envelope * gain * 0.14;
  }, stereo, true);
  voice(start, level, pan);
  if (delay) {
    voice(start + 0.375, level * 0.27, -pan * 0.8);
    voice(start + 0.75, level * 0.11, pan * 0.6);
  }
}

function sweep(end, duration = 0.6, level = 1) {
  let low = 0;
  let previousLow = 0;
  let phase = 0;
  event(end - duration, duration + 0.28, (t) => {
    const p = clamp(t / duration, 0, 1);
    const cutoff = 0.035 + 0.34 * p * p;
    low += cutoff * (noise() - low);
    previousLow += 0.027 * (low - previousLow);
    phase += TAU * (180 + 340 * p * p) / RATE;
    const env = t < duration ? smooth(p) ** 1.2 : Math.exp(-(t - duration) / 0.045);
    const airy = (low - previousLow) * 0.8 + Math.sin(phase) * 0.025;
    return airy * env * level * 0.15 * smooth((duration + 0.28 - t) / 0.07);
  }, -0.12);
}

function shimmer(start, notes, level = 1) {
  notes.forEach((note, index) => pluck(start + index * 0.0625, note, level * 0.45,
    [-0.55, 0.4, -0.15, 0.5][index % 4], true));
}

// 20 original two-second bars at 120 BPM. D minor / B-flat / F / C.
const progression = [
  {root: 38, chord: [50, 53, 57, 64], arp: [74, 77, 81, 76]},
  {root: 34, chord: [46, 53, 57, 62], arp: [74, 77, 81, 77]},
  {root: 41, chord: [53, 57, 60, 67], arp: [72, 77, 81, 79]},
  {root: 36, chord: [48, 55, 58, 62], arp: [74, 79, 82, 79]},
];

for (let bar = 0; bar < 20; bar++) {
  const start = bar * 2;
  const chord = progression[bar % 4];
  const intro = bar < 4;
  const tension = bar >= 4 && bar < 6;
  const reveal = bar >= 6 && bar < 9;
  const nuance = bar >= 9 && bar < 11;
  const product = bar >= 11 && bar < 15;
  const build = bar >= 15 && bar < 17;
  const cta = bar >= 17;
  const final = bar === 19;

  // The opening cuts are punctuated, leaving room for on-screen copy.
  if (intro) {
    kick(start, 0.85);
    if (bar > 0) kick(start + 1, 0.7);
    click(start + 0.75, 0.7, -0.35);
    click(start + 1.5, 0.48, 0.35);
    hat(start + 0.5, 0.5, false, -0.25);
    hat(start + 1.5, 0.55, false, 0.25);
    bass(start + 0.04, chord.root, 0.52, 0.62);
    pluck(start + 0.25, chord.arp[0], 0.53, -0.24);
    if (bar % 2 === 1) pluck(start + 1.25, chord.arp[2], 0.46, 0.3);
    pad(start, chord.chord, 2.3, 0.58);
  }

  if (tension) {
    kick(start, 0.88);
    kick(start + 1, 0.7);
    [0, 0.5, 1, 1.5].forEach((at, i) => hat(start + at + 0.25, 0.65, false, i % 2 ? -0.28 : 0.28));
    clap(start + 1.5, 0.55);
    bass(start + 0.06, 38, 0.58, 0.75);
    bass(start + 1.125, 38, 0.42, 0.65);
    [0.25, 0.75, 1.25, 1.75].forEach((at, i) => pluck(start + at, [74, 76, 77, 81][i], 0.42, i % 2 ? 0.28 : -0.28));
    pad(start, [50, 53, 57, 64], 2.3, 0.48);
  }

  if (reveal || product || build || (cta && !final)) {
    const energy = product || cta ? 1 : reveal ? 0.87 : 0.93;
    [0, 0.5, 1, 1.5].forEach((at) => kick(start + at, energy));
    [0.5, 1.5].forEach((at) => clap(start + at, energy * 0.88));
    for (let eighth = 0; eighth < 8; eighth++) {
      const offbeat = eighth % 2 === 1;
      hat(start + eighth * 0.25 + (offbeat ? 0.012 : 0),
        (offbeat ? 0.85 : 0.42) * energy, offbeat && eighth === 7,
        offbeat ? 0.28 : -0.28);
    }
    bass(start + 0.045, chord.root, 0.31, energy);
    bass(start + 0.75, chord.root, 0.2, energy * 0.82);
    bass(start + 1.045, chord.root, 0.31, energy * 0.93);
    bass(start + 1.75, chord.root + (bar % 2 ? 7 : 12), 0.17, energy * 0.63);
    pad(start, chord.chord, 2.35, energy * 0.86);
    [0.25, 0.75, 1.25, 1.75].forEach((at, i) =>
      pluck(start + at, chord.arp[i], energy * (i === 0 ? 0.71 : 0.57), i % 2 ? 0.3 : -0.3));
    if (product || cta) {
      click(start + 0.875, 0.34, -0.5);
      click(start + 1.875, 0.42, 0.5);
    }
    if (build) {
      for (let fill = 0; fill < 4 + (bar - 15) * 4; fill++) {
        const spacing = bar === 16 ? 0.125 : 0.25;
        click(start + 1 + fill * spacing, 0.25 + fill * 0.025, fill % 2 ? 0.32 : -0.32);
      }
    }
  }

  if (nuance) {
    kick(start, 0.66);
    hat(start + 1.5, 0.35, true, 0.2);
    bass(start + 0.07, chord.root, 0.76, 0.48);
    pad(start, chord.chord, 2.35, 0.58);
    pluck(start + 0.5, chord.arp[0] - 12, 0.62, -0.2);
    pluck(start + 1.5, chord.arp[2] - 12, 0.42, 0.28);
  }

  if (final) {
    // A clear home-key resolution gives the CTA space, then a one-second fade.
    kick(start, 0.92);
    bass(start + 0.035, 38, 1.35, 0.85);
    pad(start, [50, 53, 57, 62], 2, 1.25);
    shimmer(start + 0.04, [74, 77, 81, 86], 1.18);
    hat(start + 0.5, 0.52, true, -0.25);
    pluck(start + 0.75, 74, 0.55, 0.2);
  }
}

// Controlled transitions at the seven storyboard boundaries.
[[2, 0.35, 0.32], [4, 0.35, 0.3], [6, 0.35, 0.3], [8, 0.5, 0.55],
  [12, 1.2, 0.85], [18, 0.55, 0.45], [22, 0.95, 0.82],
  [30, 0.65, 0.58], [34, 1.0, 0.82], [38, 0.5, 0.48]]
  .forEach(([at, length, level]) => sweep(at, length, level));
shimmer(12.03, [74, 77, 81, 86], 0.85);
shimmer(22.03, [74, 77, 81, 86], 0.9);
shimmer(34.03, [74, 77, 81, 86], 0.75);

// Gentle sidechain leaves the kick uncluttered without obvious pumping.
const duck = new Float32Array(FRAMES);
duck.fill(1);
for (const at of kickTimes) {
  const first = Math.round(at * RATE);
  for (let j = 0; j < RATE * 0.23 && first + j < FRAMES; j++) {
    duck[first + j] = Math.min(duck[first + j], 1 - 0.32 * Math.exp(-(j / RATE) / 0.062));
  }
}

// Short original stereo reflections on music only; no external impulse responses.
const reflections = [
  {delay: 0.053, gain: 0.075, swap: true},
  {delay: 0.089, gain: 0.055, swap: false},
  {delay: 0.137, gain: 0.04, swap: true},
  {delay: 0.211, gain: 0.026, swap: false},
];
for (let i = 0; i < FRAMES; i++) {
  let ml = musicL[i];
  let mr = musicR[i];
  for (const reflection of reflections) {
    const j = i - Math.round(reflection.delay * RATE);
    if (j >= 0) {
      ml += (reflection.swap ? musicR[j] : musicL[j]) * reflection.gain;
      mr += (reflection.swap ? musicL[j] : musicR[j]) * reflection.gain;
    }
  }
  left[i] += ml * duck[i];
  right[i] += mr * duck[i];
}

// DC/subsonic removal and restrained analogue-style soft saturation.
const highpassAlpha = Math.exp(-TAU * 25 / RATE);
let prevInL = 0, prevInR = 0, prevOutL = 0, prevOutR = 0;
let peakBefore = 0;
for (let i = 0; i < FRAMES; i++) {
  const inL = left[i];
  const inR = right[i];
  const hpL = highpassAlpha * (prevOutL + inL - prevInL);
  const hpR = highpassAlpha * (prevOutR + inR - prevInR);
  prevInL = inL; prevInR = inR; prevOutL = hpL; prevOutR = hpR;
  const t = i / RATE;
  const fade = smooth(t / 0.006) * smooth((SECONDS - t) / 1);
  left[i] = Math.tanh(hpL * 1.16) * fade;
  right[i] = Math.tanh(hpR * 1.16) * fade;
  peakBefore = Math.max(peakBefore, Math.abs(left[i]), Math.abs(right[i]));
}

const targetPeak = 0.82;
const gain = targetPeak / peakBefore;
const dataBytes = FRAMES * 4;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0); wav.writeUInt32LE(dataBytes + 36, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
let peak = 0;
let squareSum = 0;
for (let i = 0; i < FRAMES; i++) {
  const l = Math.round(clamp(left[i] * gain, -1, 1) * 32767);
  const r = Math.round(clamp(right[i] * gain, -1, 1) * 32767);
  wav.writeInt16LE(l, 44 + i * 4);
  wav.writeInt16LE(r, 46 + i * 4);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  squareSum += (l / 32767) ** 2 + (r / 32767) ** 2;
}

const output = fileURLToPath(new URL('../public/audio/cognirun-original-score.wav', import.meta.url));
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, wav);
const rms = Math.sqrt(squareSum / (FRAMES * 2));
if (wav.readUInt32LE(40) / wav.readUInt32LE(28) !== 40) throw new Error('Duration check failed');
if (peak / 32767 > 0.85) throw new Error('Peak headroom check failed');
console.log(JSON.stringify({output, seconds: SECONDS, sampleRate: RATE, channels: 2,
  bitDepth: 16, bpm: 120, frames: FRAMES, peak: peak / 32767,
  peakDbfs: 20 * Math.log10(peak / 32767), rmsDbfs: 20 * Math.log10(rms),
  bytes: wav.length, deterministicSeed: 'c0912026', originalSynthesizedAudio: true}, null, 2));
