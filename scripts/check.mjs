import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd());

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (/\.(m?js)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = [...await collect(join(root, 'www', 'js')), join(root, 'server.mjs')];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const html = await readFile(join(root, 'www', 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);

for (const required of ['view-home', 'view-setup', 'view-session', 'view-results', 'view-study', 'task-card', 'condition-curve']) {
  if (!ids.includes(required)) throw new Error(`Missing required UI element #${required}`);
}

console.log(`Syntax OK: ${files.length} modules · HTML OK: ${ids.length} unique ids`);
