import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {access, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'out');
const qa = path.join(out, 'qa');
await mkdir(qa, {recursive: true});
let browserExecutable;
for (const executable of [process.env.REMOTION_BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean)) {
  try { await access(executable); browserExecutable = executable; break; } catch {}
}
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), outDir: path.join(root, 'dist-pitch'), publicDir: path.join(root, 'public')});
const browser = await openBrowser('chrome', {browserExecutable, logLevel: 'warn'});
try {
  const composition = await selectComposition({serveUrl, id: 'CogniRun-Pitch', puppeteerInstance: browser, browserExecutable, logLevel: 'warn'});
  if (composition.durationInFrames !== 1800 || composition.fps !== 30) throw new Error('Pitch composition must be 60 seconds at 30fps.');
  await renderMedia({serveUrl, composition, codec: 'h264', crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', enforceAudioTrack: true, outputLocation: path.join(out, 'cognirun-pitch-16x9.mp4'), concurrency: 4, x264Preset: 'fast', puppeteerInstance: browser, browserExecutable, logLevel: 'warn'});
  for (const [name, frame] of [['opening', 60], ['voice-answer', 900], ['results', 1450], ['closing', 1730]]) await renderStill({serveUrl, composition, frame, output: path.join(qa, `pitch-${name}.png`), imageFormat: 'png', puppeteerInstance: browser, browserExecutable, logLevel: 'warn'});
  console.log('Rendered out/cognirun-pitch-16x9.mp4 (1920x1080, 60 seconds).');
} finally { await browser.close({silent: true}); }
