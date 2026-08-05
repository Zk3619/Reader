#!/usr/bin/env node
/**
 * Static checks for src/lib/download/ytdlp, which is ported from Python and bundled
 * for the browser. Vite/ESM only reports the first offender at runtime, so both
 * checks list every violation at once:
 *
 * 1. Every named import must resolve to a real export of the target module
 *    (following `export *` / `export { x } from` chains).
 * 2. No Node-only globals — they are absent in the browser and blow up on first use.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TARGET = join(ROOT, 'src', 'lib', 'download', 'ytdlp');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveModule(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT_RE = /import\s+(type\s+)?(?:([\w$]+)\s*,\s*)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
const REEXPORT_NAMED_RE = /export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
const REEXPORT_STAR_RE = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
const LOCAL_EXPORT_RE =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum|abstract\s+class)\s+([\w$]+)/gm;
const LOCAL_EXPORT_LIST_RE = /^export\s+(?:type\s+)?\{([^}]*)\}\s*;?\s*$/gm;

function parseSpecifiers(block) {
  return block
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const cleaned = s.replace(/^type\s+/, '');
      const [orig, alias] = cleaned.split(/\s+as\s+/).map((x) => x.trim());
      return { orig, alias: alias || orig };
    });
}

const exportCache = new Map();

function getExports(file, stack = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (stack.has(file)) return new Set();
  stack.add(file);

  const src = readFileSync(file, 'utf8');
  const names = new Set();

  for (const m of src.matchAll(LOCAL_EXPORT_RE)) names.add(m[1]);
  for (const m of src.matchAll(LOCAL_EXPORT_LIST_RE)) {
    for (const { alias } of parseSpecifiers(m[1])) names.add(alias);
  }
  for (const m of src.matchAll(REEXPORT_NAMED_RE)) {
    for (const { alias } of parseSpecifiers(m[1])) names.add(alias);
  }
  for (const m of src.matchAll(REEXPORT_STAR_RE)) {
    const target = resolveModule(file, m[1]);
    if (target) for (const n of getExports(target, stack)) names.add(n);
  }

  stack.delete(file);
  exportCache.set(file, names);
  return names;
}

const files = await walk(TARGET);
const problems = [];
const nodeGlobalHits = [];

/** Bare identifier usage (not a property access, not part of a longer name). */
const NODE_GLOBAL_RE = /(?<![.\w$])(Buffer\b|__dirname\b|__filename\b|require\s*\()/g;

/** Blank out comments and string/template literals so their contents never match. */
function stripNonCode(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/^\s*\*.*$/, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  src.split('\n').forEach((line, i) => {
    for (const m of stripNonCode(line).matchAll(NODE_GLOBAL_RE)) {
      nodeGlobalHits.push({ file: relative(ROOT, file), line: i + 1, name: m[1].trim() });
    }
  });

  for (const m of src.matchAll(IMPORT_RE)) {
    const target = resolveModule(file, m[4]);
    if (!target) continue;
    const available = getExports(target);
    if (!available.size) continue;
    const siblingHelpers = resolveModule(file, './_helpers');
    const helperNames = siblingHelpers ? getExports(siblingHelpers) : new Set();
    for (const { orig } of parseSpecifiers(m[3])) {
      if (!available.has(orig)) {
        problems.push({
          file: relative(ROOT, file),
          spec: m[4],
          name: orig,
          inHelpers: helperNames.has(orig),
        });
      }
    }
  }
}

if (!problems.length && !nodeGlobalHits.length) {
  console.log(`OK: checked ${files.length} files, no missing named imports, no Node-only globals.`);
  process.exit(0);
}

if (problems.length) {
  const byFile = new Map();
  for (const p of problems) {
    const key = `${p.file} <- ${p.spec}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(p.inHelpers ? `${p.name} (available in ./_helpers)` : p.name);
  }
  console.log('Missing named imports:');
  for (const [key, names] of [...byFile].sort()) {
    console.log(`  ${key}: ${names.join(', ')}`);
  }
  console.log(`  -> ${problems.length} missing name(s) in ${byFile.size} import statement(s).\n`);
}

if (nodeGlobalHits.length) {
  console.log('Node-only globals (undefined in the browser bundle):');
  for (const h of nodeGlobalHits) {
    console.log(`  ${h.file}:${h.line}: ${h.name}`);
  }
  console.log(`  -> ${nodeGlobalHits.length} usage(s). Use Web APIs instead ` +
    '(TextEncoder/TextDecoder, atob/btoa, Uint8Array).');
}

process.exit(1);
