#!/usr/bin/env node
/**
 * 抽样 smoke：确认 registry 无 Stub、HAND_OVERRIDES 齐全、条目量级正确。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reg = fs.readFileSync(
  path.resolve(__dirname, '../extractors/generated-registry.ts'),
  'utf8',
);

const must = [
  'Youtube',
  'BiliBili',
  'Douyin',
  'BiliBiliBangumi',
  'Instagram',
  'Reddit',
  'Niconico',
  'Generic',
];
for (const k of must) {
  if (!reg.includes(`"${k}"`)) {
    console.error(`FAIL: HAND_OVERRIDES missing ${k}`);
    process.exit(1);
  }
}
if (/StubIE|\[stub\]/.test(reg)) {
  console.error('FAIL: stub markers present');
  process.exit(1);
}
const n = Number(reg.match(/Entries:\s*(\d+)/)?.[1] || 0);
if (n < 2000) {
  console.error(`FAIL: entries ${n}`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, entries: n, overridesChecked: must.length }, null, 2));
