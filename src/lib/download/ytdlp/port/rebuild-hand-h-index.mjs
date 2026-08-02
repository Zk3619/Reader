#!/usr/bin/env node
/**
 * Rebuild hand-h/index.ts from exported *IE classes + generated-registry ie_key map.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handDir = path.resolve(__dirname, '../extractors/hand-h');
const regPath = path.resolve(__dirname, '../extractors/generated-registry.ts');
const reg = fs.readFileSync(regPath, 'utf8');

/** @type {Map<string, string>} */
const classToKey = new Map();
for (const m of reg.matchAll(/ie_key:\s*"([^"]+)",\s*ie_name:\s*"[^"]*",\s*className:\s*"([^"]+)"/g)) {
  classToKey.set(m[2], m[1]);
}

/** @type {Array<{cls:string, file:string, key:string}>} */
const entries = [];
for (const f of fs.readdirSync(handDir).filter((n) => n.endsWith('.ts') && !['index.ts', 'helpers.ts', '_helpers.ts'].includes(n))) {
  const text = fs.readFileSync(path.join(handDir, f), 'utf8');
  for (const m of text.matchAll(/^export (?:abstract )?class (\w+IE)\b/gm)) {
    const cls = m[1];
    const key = classToKey.get(cls);
    if (!key) {
      console.warn('NO_KEY', cls, f);
      continue;
    }
    entries.push({ cls, file: f.replace(/\.ts$/, ''), key });
  }
}

const seen = new Set();
const unique = [];
for (const e of entries.sort((a, b) => a.key.localeCompare(b.key))) {
  if (seen.has(e.key)) continue;
  seen.add(e.key);
  unique.push(e);
}

/** @type {Map<string, string[]>} */
const byFile = new Map();
for (const e of unique) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e.cls);
}

const lines = [];
lines.push('/**');
lines.push(' * Hand-written batch H (harpodeon → hytale) — auto-rebuilt by port/rebuild-hand-h-index.mjs');
lines.push(' */');
lines.push('');
lines.push("import type { InfoExtractor } from '../../common';");
lines.push('');

for (const file of [...byFile.keys()].sort()) {
  const classes = byFile.get(file);
  lines.push(`import { ${classes.join(', ')} } from './${file}';`);
}

lines.push('');
lines.push('export type HandHEntry = {');
lines.push('  ie_key: string;');
lines.push('  IE: new () => InfoExtractor;');
lines.push('};');
lines.push('');
lines.push('export const HAND_H_IES: HandHEntry[] = [');
for (const e of unique) {
  lines.push(`  { ie_key: '${e.key}', IE: ${e.cls} },`);
}
lines.push('];');
lines.push('');
lines.push('export {');
for (const e of unique) {
  lines.push(`  ${e.cls},`);
}
lines.push('};');
lines.push('');

fs.writeFileSync(path.join(handDir, 'index.ts'), lines.join('\n'), 'utf8');
console.log(JSON.stringify({ count: unique.length, keys: unique.map((e) => e.key) }, null, 2));
