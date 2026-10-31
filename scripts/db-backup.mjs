#!/usr/bin/env node
/**
 * Local backup of the linked Supabase project (no GitHub Actions minutes):
 * schema and data (including auth users) into backups/<timestamp>/.
 * Needs Docker running and `npx supabase login` + `npx supabase link` done once.
 * backups/ is git-ignored: the dumps hold personal data, keep them private.
 *
 *   npm run db:backup
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const stamp = new Date().toISOString().replace(/[:]/g, '').slice(0, 15);
const dir = join('backups', stamp);
mkdirSync(dir, { recursive: true });

for (const [file, args] of [
  ['schema.sql', []],
  ['data.sql', ['--data-only', '--use-copy']],
]) {
  const out = join(dir, file);
  const result = spawnSync('npx', ['--yes', 'supabase', 'db', 'dump', '--linked', ...args, '-f', out], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`db dump failed for ${file}`);
    process.exit(result.status ?? 1);
  }
  console.log(`${out}: ${Math.round(statSync(out).size / 1024)} KB`);
}
console.log(`Backup written to ${dir}. Restore with psql against a fresh project.`);
