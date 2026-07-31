#!/usr/bin/env node
/** Wrapper: python transpile_extractors.py */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const py = path.join(__dirname, 'transpile_extractors.py');
const r = spawnSync('python', [py, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
