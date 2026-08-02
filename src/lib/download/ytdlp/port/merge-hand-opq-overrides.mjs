#!/usr/bin/env node
/**
 * Merge HAND_O_IES + HAND_P_IES + HAND_Q_IES into HAND_OVERRIDES
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const regPath = path.resolve(__dirname, '../extractors/generated-registry.ts');

function keysFrom(indexPath) {
  const text = fs.readFileSync(indexPath, 'utf8');
  return [...text.matchAll(/ie_key:\s*'([^']+)'/g)].map((m) => m[1]);
}

const handO = keysFrom(path.resolve(__dirname, '../extractors/hand-o/index.ts'));
const handP = keysFrom(path.resolve(__dirname, '../extractors/hand-p/index.ts'));
const handQ = keysFrom(path.resolve(__dirname, '../extractors/hand-q/index.ts'));

let reg = fs.readFileSync(regPath, 'utf8');
const m = reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
if (!m) {
  console.error('HAND_OVERRIDES not found');
  process.exit(1);
}
const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const merged = [...new Set([...existing, ...handO, ...handP, ...handQ])].sort((a, b) =>
  a.localeCompare(b),
);
const body = merged.map((k) => `  "${k}",`).join('\n');
reg = reg.replace(
  /export const HAND_OVERRIDES = new Set\(\[[\s\S]*?\]\);/,
  `export const HAND_OVERRIDES = new Set([\n${body}\n]);`,
);
fs.writeFileSync(regPath, reg, 'utf8');
console.log(
  JSON.stringify(
    { handO: handO.length, handP: handP.length, handQ: handQ.length, total: merged.length },
    null,
    2,
  ),
);
