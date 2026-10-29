#!/usr/bin/env node
/**
 * Local ship gate: everything CI would check, run on this machine so GitHub
 * Actions minutes are only spent on the final confirmation.
 *
 *   npm run check            lint, unit tests, build, e2e
 *   npm run check -- --fast  lint + unit tests only (what the pre-push hook runs)
 *   npm run check -- --db    also the Supabase pgTAP tests (needs Docker and a
 *                            running local stack: npm run db:start)
 */
import { spawnSync } from 'node:child_process';

const fast = process.argv.includes('--fast');
const db = process.argv.includes('--db');

const steps = [
  ['lint', 'npm run lint'],
  ['web unit tests', 'npm --prefix web test'],
  ['question-server tests', 'npm --prefix question-server test'],
  ...(db ? [['database tests (pgTAP)', 'npm run db:test']] : []),
  ...(fast
    ? []
    : [
        ['build', 'npm --prefix web run build'],
        ['e2e (Playwright)', 'npx playwright test'],
      ]),
];

for (const [name, command] of steps) {
  const started = Date.now();
  console.log(`\n> ${name}: ${command}`);
  const { status } = spawnSync(command, { stdio: 'inherit', shell: true });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (status !== 0) {
    console.error(`\nFAILED: ${name} (${seconds}s)`);
    process.exit(status ?? 1);
  }
  console.log(`ok: ${name} (${seconds}s)`);
}
console.log('\nGate passed.');
