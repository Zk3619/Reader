#!/usr/bin/env node
/**
 * Merge HAND_L_IES + HAND_M_IES + HAND_N_IES into HAND_OVERRIDES
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

const handL = keysFrom(path.resolve(__dirname, '../extractors/hand-l/index.ts'));
const handM = keysFrom(path.resolve(__dirname, '../extractors/hand-m/index.ts'));
const handN = keysFrom(path.resolve(__dirname, '../extractors/hand-n/index.ts'));

let reg = fs.readFileSync(regPath, 'utf8');
const m = reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
if (!m) {
  console.error('HAND_OVERRIDES not found');
  process.exit(1);
}
const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const merged = [...new Set([...existing, ...handL, ...handM, ...handN])].sort((a, b) =>
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
    { handL: handL.length, handM: handM.length, handN: handN.length, total: merged.length },
    null,
    2,
  ),
);
