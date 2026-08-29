import { defineConfig } from 'vite';

export default defineConfig({
  // The bundled question library is imported from ../question-server.
  // `.trycloudflare.com` so a phone can open the dev server through a quick tunnel.
  server: { fs: { allow: ['..'] }, allowedHosts: ['.trycloudflare.com'] },
});
