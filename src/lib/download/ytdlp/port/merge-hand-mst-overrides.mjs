#!/usr/bin/env node
/**
 * Merge HAND_M/S/T_IES into HAND_OVERRIDES
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

const handM = keysFrom(path.resolve(__dirname, '../extractors/hand-m/index.ts'));
const handS = keysFrom(path.resolve(__dirname, '../extractors/hand-s/index.ts'));
const handT = keysFrom(path.resolve(__dirname, '../extractors/hand-t/index.ts'));
const handBatch = [...new Set([...handM, ...handS, ...handT])];

let reg = fs.readFileSync(regPath, 'utf8');
const m = reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
if (!m) {
  console.error('HAND_OVERRIDES not found');
  process.exit(1);
}
const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const merged = [...new Set([...existing, ...handBatch])].sort((a, b) => a.localeCompare(b));
const body = merged.map((k) => `  "${k}",`).join('\n');
reg = reg.replace(
  /export const HAND_OVERRIDES = new Set\(\[[\s\S]*?\]\);/,
  `export const HAND_OVERRIDES = new Set([\n${body}\n]);`,
);
fs.writeFileSync(regPath, reg, 'utf8');
console.log(
  JSON.stringify(
    { handM: handM.length, handS: handS.length, handT: handT.length, total: merged.length },
    null,
    2,
  ),
);
