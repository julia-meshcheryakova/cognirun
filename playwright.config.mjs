import { defineConfig, devices } from '@playwright/test';

// Runs against the production build served by `vite preview`, so build first
// (`npm run build`, or just `npm run check`, which does both).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm --prefix web run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
