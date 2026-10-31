// Regenerates every app icon from one vector definition of the mark:
// Android launcher mipmaps, the web favicon, PWA icons and the social preview.
// Usage: node scripts/icons.mjs   (needs the Playwright Chromium the e2e uses)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const pub = join(root, 'web/public');

// Adaptive-icon canvas is 108dp; launchers show the middle 72dp and guarantee
// a 66dp circle. MARK_SCALE makes the mark fill that circle, tips just inside it.
const MARK_SCALE = 1.22;
const GRID_STEP = 20.25;

function markShapes() {
  // The mark drawn upright around (0,0); it is turned 45° when placed.
  const t = `translate(54 54) rotate(45) scale(${MARK_SCALE})`;
  const r = (x, y, w, h) => `<rect transform="${t}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return [
    r(-3.5, -24.75, 7, 14.25),
    r(-17.75, -10.5, 35.5, 7),
    r(-17.75, 3.5, 35.5, 7),
    r(-3.5, 10.5, 7, 14.25),
  ].join('');
}

function gridLines() {
  const lines = [];
  for (let c = -108; c <= 216; c += GRID_STEP) {
    lines.push(`<line x1="${c}" y1="0" x2="${c - 108}" y2="108"/>`);
    lines.push(`<line x1="${c - 108}" y1="0" x2="${c}" y2="108"/>`);
  }
  return `<g stroke="#e5e9f1" stroke-width="0.4">${lines.join('')}</g>`;
}

/** @param {{ background?: boolean, viewBox?: string, shape?: 'square'|'rounded'|'circle' }} o */
export function iconSvg({ background = true, viewBox = '0 0 108 108', shape = 'square' } = {}) {
  const [vx, vy, vw] = viewBox.split(' ').map(Number);
  const clip =
    shape === 'circle'
      ? `<circle cx="54" cy="54" r="${vw / 2}"/>`
      : `<rect x="${vx}" y="${vy}" width="${vw}" height="${vw}" rx="${shape === 'rounded' ? vw * 0.22 : 0}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
<defs>
<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="30" y1="78" x2="78" y2="30">
<stop offset="0" stop-color="#7dd1ff"/><stop offset="1" stop-color="#4fadff"/>
</linearGradient>
<clipPath id="mark">${markShapes()}</clipPath>
<clipPath id="shape">${clip}</clipPath>
</defs>
<g clip-path="url(#shape)">
${background ? '<rect x="-54" y="-54" width="216" height="216" fill="#fff"/>' : ''}
${gridLines()}
<rect width="108" height="108" fill="url(#g)" clip-path="url(#mark)"/>
</g>
</svg>`;
}

const VISIBLE = '18 18 72 72'; // what a launcher shows of the 108dp canvas

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  async function render(svg, size, file, transparent = true) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  }

  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    await render(iconSvg({ background: false }), 108 * k, join(dir, 'ic_launcher_foreground.png'));
    await render(iconSvg({ viewBox: VISIBLE, shape: 'rounded' }), 48 * k, join(dir, 'ic_launcher.png'));
    await render(iconSvg({ viewBox: VISIBLE, shape: 'circle' }), 48 * k, join(dir, 'ic_launcher_round.png'));
  }

  writeFileSync(join(pub, 'favicon.svg'), iconSvg({ viewBox: VISIBLE, shape: 'rounded' }) + '\n');
  await render(iconSvg({ viewBox: VISIBLE, shape: 'rounded' }), 192, join(pub, 'icon-192.png'));
  await render(iconSvg({ viewBox: VISIBLE, shape: 'rounded' }), 512, join(pub, 'icon-512.png'));
  await render(iconSvg(), 512, join(pub, 'icon-maskable-512.png'), false);
  await render(iconSvg({ viewBox: VISIBLE }), 180, join(pub, 'apple-touch-icon.png'), false);

  // Social preview card (1200×630) in the app's own colours and font.
  const font = readFileSync(
    join(root, 'web/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff2'),
  ).toString('base64');
  const fontRegular = readFileSync(
    join(root, 'web/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'),
  ).toString('base64');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<html><head><style>
@font-face{font-family:J;font-weight:800;src:url(data:font/woff2;base64,${font}) format('woff2')}
@font-face{font-family:J;font-weight:400;src:url(data:font/woff2;base64,${fontRegular}) format('woff2')}
body{margin:0;width:1200px;height:630px;background:#05080a;color:#d8f2f0;font-family:J,monospace;
display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;
background-image:linear-gradient(#0d1518 1px,transparent 1px),linear-gradient(90deg,#0d1518 1px,transparent 1px);background-size:40px 40px}
.icon svg{width:300px;height:300px;display:block}
h1{font-size:96px;font-weight:800;margin:0;color:#2ee6c5;letter-spacing:-2px}
p{font-size:34px;margin:24px 0 0;line-height:1.35;color:#d8f2f0}
small{display:block;margin-top:28px;font-size:24px;color:#7ea3ac}
</style></head><body><div class="icon">${iconSvg({ viewBox: VISIBLE, shape: 'rounded' })}</div>
<div><h1>CogniRun</h1><p>Quiz and logic questions<br>while you run.</p><small>Answer by voice · weekly challenges</small></div>
</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(pub, 'og-image.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });

  await browser.close();
  console.log('Icons written to android/app/src/main/res/mipmap-* and web/public.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
