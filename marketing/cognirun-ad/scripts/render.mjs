import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'out');
const qa = path.join(out, 'qa');
await mkdir(qa, { recursive: true });
const args = new Set(process.argv.slice(2));
const stillsOnly = args.has('--stills');
const variants = [
  { id: 'CogniRun-Landscape', name: 'landscape', filename: 'cognirun-hackathon-16x9.mp4' },
  { id: 'CogniRun-Portrait', name: 'portrait', filename: 'cognirun-hackathon-9x16.mp4' },
].filter(v => !args.has('--landscape') && !args.has('--portrait') || args.has(`--${v.name}`));
const frameNumbers = [40, 96, 156, 216, 315, 480, 624, 702, 840, 990, 1137];

let browserExecutable;
for (const executable of [process.env.REMOTION_BROWSER_EXECUTABLE, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean)) {
  try { await access(executable); browserExecutable = executable; break; } catch { /* Let Remotion download its own browser if needed. */ }
}

console.log('Bundling the self-contained CogniRun advert.');
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), outDir: path.join(root, 'dist'), publicDir: path.join(root, 'public') });
const browser = await openBrowser('chrome', { browserExecutable, logLevel: 'warn' });
const report = { durationSeconds: 40, fps: 30, variants: [], createdAt: new Date().toISOString() };
try {
  for (const variant of variants) {
    const composition = await selectComposition({ serveUrl, id: variant.id, puppeteerInstance: browser, browserExecutable, logLevel: 'warn' });
    if (composition.durationInFrames !== 1200 || composition.fps !== 30) throw new Error('Unexpected timeline duration.');
    console.log(`${variant.id}: ${composition.width}×${composition.height}, 40 seconds.`);
    if (stillsOnly) {
      for (const [index, frame] of frameNumbers.entries()) {
        const output = path.join(qa, `${variant.name}-${String(index + 1).padStart(2, '0')}.png`);
        await renderStill({ serveUrl, composition, frame, output, imageFormat: 'png', puppeteerInstance: browser, browserExecutable, logLevel: 'warn' });
        console.log(`Inspected-frame candidate: ${variant.name}, frame ${frame} → ${path.basename(output)}`);
      }
    } else {
      let lastPercent = -10;
      await renderMedia({
        serveUrl, composition, codec: 'h264', crf: 18, pixelFormat: 'yuv420p',
        audioCodec: 'aac', audioBitrate: '192k', enforceAudioTrack: true,
        outputLocation: path.join(out, variant.filename), concurrency: 4,
        x264Preset: 'fast', puppeteerInstance: browser, browserExecutable,
        logLevel: 'warn',
        onProgress: ({ progress }) => {
          const percent = Math.floor(progress * 100);
          if (percent >= lastPercent + 10 || percent === 100 && lastPercent !== 100) { console.log(`${variant.name}: ${percent}%`); lastPercent = percent; }
        },
      });
      await renderStill({ serveUrl, composition, frame: 1137, output: path.join(out, `cognirun-poster-${variant.name}.jpg`), imageFormat: 'jpeg', jpegQuality: 95, puppeteerInstance: browser, browserExecutable, logLevel: 'warn' });
    }
    report.variants.push({ ...variant, width: composition.width, height: composition.height, frames: composition.durationInFrames });
  }
} finally {
  await browser.close({ silent: true });
}
await writeFile(path.join(out, stillsOnly ? 'stills-report.json' : 'render-report.json'), JSON.stringify(report, null, 2));
console.log(`Done. Outputs are in ${out}`);
