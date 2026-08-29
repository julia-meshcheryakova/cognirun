import { defineConfig } from 'vite';

export default defineConfig({
  // The bundled question library is imported from ../question-server.
  server: { fs: { allow: ['..'] } },
});
