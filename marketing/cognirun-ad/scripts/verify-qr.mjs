import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const root = fileURLToPath(new URL('../', import.meta.url));
const expected = 'https://dreamy-meringue-246d16.netlify.app/';
const files = process.argv.length > 2 ? process.argv.slice(2) : [
  'public/join-qr.png', 'out/qa/landscape-11.png', 'out/qa/portrait-11.png',
];

for (const file of files) {
  const png = PNG.sync.read(await readFile(path.resolve(root, file)));
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (result?.data !== expected) throw new Error(`QR verification failed for ${file}: ${result?.data ?? 'not decoded'}`);
  console.log(`Decoded ${file}: ${result.data}`);
  if (png.width !== png.height) {
    const width = png.height > png.width ? 390 : 1280;
    const height = Math.round(png.height * width / png.width);
    const scaled = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const source = (Math.floor(y * png.height / height) * png.width + Math.floor(x * png.width / width)) * 4;
        scaled.set(png.data.subarray(source, source + 4), (y * width + x) * 4);
      }
    }
    if (jsQR(scaled, width, height)?.data !== expected) throw new Error(`QR did not decode at ${width}px display width: ${file}`);
    console.log(`Also decoded at ${width}px display width.`);
  }
}
