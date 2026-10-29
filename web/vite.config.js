import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // The bundled question library is imported from ../question-server.
  server: { fs: { allow: ['..'] } },
  define: { __APP_VERSION__: JSON.stringify(version) },
});