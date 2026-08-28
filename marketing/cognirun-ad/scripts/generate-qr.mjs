import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(publicDir, { recursive: true });
await QRCode.toFile(`${publicDir}/join-qr.png`, 'https://dreamy-meringue-246d16.netlify.app/', {
  errorCorrectionLevel: 'M', margin: 4, width: 600,
  color: { dark: '#091014', light: '#F3F1E8' },
});
console.log('Generated the untracked QR link to the hosted CogniRun prototype.');
