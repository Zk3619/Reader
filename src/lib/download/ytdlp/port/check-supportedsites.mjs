#!/usr/bin/env node
/**
 * 对表验收：registry 条目 vs 上游 _extractors / supportedsites。
 *
 * Usage:
 *   node port/check-supportedsites.mjs
 *   node port/check-supportedsites.mjs --yt-dlp d:/Projects/Rust/Reader/Download/yt-dlp-master
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findYtDlp(explicit) {
  const candidates = [
    explicit,
    process.env.YT_DLP_ROOT,
    path.resolve(__dirname, '../../../../../Download/yt-dlp-master'),
    'd:/Projects/Rust/Reader/Download/yt-dlp-master',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'yt_dlp', 'extractor', '_extractors.py'))) return c;
  }
  return null;
}

const args = process.argv.slice(2);
let yt = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--yt-dlp') yt = args[++i];
}
const root = findYtDlp(yt);
if (!root) {
  console.error('yt-dlp root not found');
  process.exit(1);
}

const extractorsPy = fs.readFileSync(
  path.join(root, 'yt_dlp', 'extractor', '_extractors.py'),
  'utf8',
);
const upstreamClasses = [...extractorsPy.matchAll(/\b([A-Za-z0-9_]+IE)\b/g)].map((m) => m[1]);
const upstreamUnique = [...new Set(upstreamClasses)].filter((c) => c !== 'InfoExtractor');

const regPath = path.resolve(__dirname, '../extractors/generated-registry.ts');
const regText = fs.readFileSync(regPath, 'utf8');
const entriesMatch = regText.match(/Entries:\s*(\d+)/);
const entryCount = entriesMatch ? Number(entriesMatch[1]) : 0;

const stubLeft = /class StubIE\b/.test(regText) || /\[stub\]/.test(regText);
const hasHand = /HAND_OVERRIDES/.test(regText);
const implementedTrue = (regText.match(/implemented:\s*true/g) || []).length;

const genDir = path.resolve(__dirname, '../extractors/generated');
let moduleCount = 0;
function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.ts')) moduleCount++;
  }
}
if (fs.existsSync(genDir)) walk(genDir);

const classInReg = [...regText.matchAll(/className:\s*"([^"]+)"/g)].map((m) => m[1]);
const regSet = new Set(classInReg);
const missing = upstreamUnique.filter((c) => !regSet.has(c));
const coverage =
  upstreamUnique.length === 0
    ? 0
    : ((upstreamUnique.length - missing.length) / upstreamUnique.length) * 100;

console.log(JSON.stringify(
  {
    ytDlp: root,
    upstreamExtractorsPy: upstreamUnique.length,
    registryEntriesHeader: entryCount,
    registryClassNames: classInReg.length,
    generatedModules: moduleCount,
    implementedTrueAssignments: implementedTrue,
    hasHandOverrides: hasHand,
    stubMainPath: stubLeft,
    coveragePct: Number(coverage.toFixed(2)),
    missingSample: missing.slice(0, 20),
    missingCount: missing.length,
  },
  null,
  2,
));

if (stubLeft) {
  console.error('FAIL: StubIE / [stub] still present in generated-registry');
  process.exit(2);
}
if (!hasHand) {
  console.error('FAIL: HAND_OVERRIDES missing');
  process.exit(2);
}
if (entryCount < 1000 || classInReg.length < 1000) {
  console.error('FAIL: registry too small');
  process.exit(2);
}
if (coverage < 95) {
  console.error(`FAIL: coverage ${coverage.toFixed(2)}% < 95%`);
  process.exit(2);
}
console.log('OK: supportedsites/registry check passed');
