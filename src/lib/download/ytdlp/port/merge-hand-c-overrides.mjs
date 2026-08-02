#!/usr/bin/env node
/**
 * Merge HAND_C_IES keys into HAND_OVERRIDES in generated-registry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handIndex = path.resolve(__dirname, '../extractors/hand-c/index.ts');
const regPath = path.resolve(__dirname, '../extractors/generated-registry.ts');

const handText = fs.readFileSync(handIndex, 'utf8');
const handKeys = [...handText.matchAll(/ie_key:\s*'([^']+)'/g)].map((m) => m[1]);

let reg = fs.readFileSync(regPath, 'utf8');
const m = reg.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
if (!m) {
  console.error('HAND_OVERRIDES not found');
  process.exit(1);
}
const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const merged = [...new Set([...existing, ...handKeys])].sort((a, b) => a.localeCompare(b));
const body = merged.map((k) => `  "${k}",`).join('\n');
reg = reg.replace(
  /export const HAND_OVERRIDES = new Set\(\[[\s\S]*?\]\);/,
  `export const HAND_OVERRIDES = new Set([\n${body}\n]);`,
);
fs.writeFileSync(regPath, reg, 'utf8');
console.log(JSON.stringify({ handC: handKeys.length, total: merged.length }, null, 2));
