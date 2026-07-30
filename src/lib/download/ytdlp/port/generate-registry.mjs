#!/usr/bin/env node
/**
 * Scan yt-dlp extractor sources and emit extractors/generated-registry.ts
 *
 * Usage:
 *   node port/generate-registry.mjs
 *   node port/generate-registry.mjs --yt-dlp d:/Projects/Download/yt-dlp-master
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../extractors/generated-registry.ts');

function parseArgs(argv) {
  const out = { ytDlp: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--yt-dlp' && argv[i + 1]) {
      out.ytDlp = argv[++i];
    }
  }
  return out;
}

function findYtDlpRoot(explicit) {
  const candidates = [
    explicit,
    process.env.YT_DLP_ROOT,
    path.resolve(__dirname, '../../../../Download/yt-dlp-master'),
    path.resolve(__dirname, '../../../../../Download/yt-dlp-master'),
    'd:/Projects/Download/yt-dlp-master',
    'D:/Projects/Download/yt-dlp-master',
  ].filter(Boolean);
  for (const c of candidates) {
    const extractorDir = path.join(c, 'yt_dlp', 'extractor');
    if (fs.existsSync(extractorDir)) return c;
  }
  return null;
}

function walkPyFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === '__pycache__') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkPyFiles(full, acc);
    else if (ent.isFile() && ent.name.endsWith('.py') && !ent.name.startsWith('_')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract class bodies roughly and pull IE_NAME / _VALID_URL */
function extractClasses(source, moduleHint) {
  const results = [];
  // Match class FooIE(...):
  const classRe = /^class\s+(\w+IE)\s*(?:\([^)]*\))?\s*:/gm;
  const matches = [...source.matchAll(classRe)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    const body = source.slice(start, end);
    if (name === 'InfoExtractor') continue;

    let ieName = null;
    const ieNameAssign = body.match(/\bIE_NAME\s*=\s*['"]([^'"]+)['"]/);
    if (ieNameAssign) ieName = ieNameAssign[1];
    else ieName = name.replace(/IE$/, '').toLowerCase();

    let validUrl = null;
    // _VALID_URL = False
    if (/\b_VALID_URL\s*=\s*False\b/.test(body)) {
      validUrl = false;
    } else {
      validUrl = extractValidUrlLiteral(body);
    }

    results.push({
      className: name,
      ieName,
      ieKey: name.replace(/IE$/, ''),
      validUrl,
      moduleHint,
    });
  }
  return results;
}

function extractValidUrlLiteral(body) {
  const idx = body.search(/\b_VALID_URL\s*=/);
  if (idx < 0) return null;
  let i = body.indexOf('=', idx) + 1;
  while (i < body.length && /\s/.test(body[i])) i++;

  // False / None
  if (body.slice(i, i + 5) === 'False') return false;
  if (body.slice(i, i + 4) === 'None') return null;

  // r'...' or r"""...""" or '...' or '''...''' or ( ... )
  if (body[i] === '(') {
    // tuple / paren expression — grab until matching paren at depth 0 for assignment is hard;
    // take first string literal inside
    const slice = body.slice(i, i + 8000);
    const inner = slice.match(/[rRuUfF]?(['"])([\s\S]*?)\1/);
    if (inner) return normalizePyString(inner[0]);
    return null;
  }

  const rawPrefix = body.slice(i).match(/^[rRuUfF]{0,3}/)?.[0] || '';
  i += rawPrefix.length;
  const quote = body.slice(i, i + 3);
  let q;
  let end;
  if (quote === "'''" || quote === '"""') {
    q = quote;
    const startContent = i + 3;
    end = body.indexOf(q, startContent);
    if (end < 0) return null;
    return normalizePyString(rawPrefix + body.slice(i, end + 3));
  }
  q = body[i];
  if (q !== "'" && q !== '"') return null;
  // single-line or escaped
  let j = i + 1;
  let esc = false;
  for (; j < body.length; j++) {
    const ch = body[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === q) break;
    if (ch === '\n') break;
  }
  if (j >= body.length) return null;
  return normalizePyString(rawPrefix + body.slice(i, j + 1));
}

function normalizePyString(lit) {
  // Strip prefixes and quotes; unescape common sequences; drop (?x) whitespace later in TS
  let s = lit.trim();
  s = s.replace(/^[rRuUfF]+/, '');
  if ((s.startsWith("'''") && s.endsWith("'''")) || (s.startsWith('"""') && s.endsWith('"""'))) {
    s = s.slice(3, -3);
  } else if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    s = s.slice(1, -1);
  }
  // Unescape
  s = s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  // Remove python .format({invidious}) leftovers roughly
  s = s.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, '');
  return s;
}

function parseExtractorsPy(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const names = [];
  const re = /^\s+([A-Z]\w*IE)\s*,?\s*$/gm;
  let m;
  while ((m = re.exec(text))) {
    names.push(m[1]);
  }
  // also: from .foo import BarIE
  const fromRe = /import\s*\(\s*([\s\S]*?)\s*\)|import\s+([A-Z]\w*IE)/g;
  while ((m = fromRe.exec(text))) {
    const block = m[1] || m[2];
    if (!block) continue;
    for (const n of block.match(/[A-Z]\w*IE/g) || []) names.push(n);
  }
  return [...new Set(names)];
}

function tsEscape(s) {
  return JSON.stringify(s);
}

function generateTs(entries, meta) {
  const lines = [];
  lines.push('/**');
  lines.push(' * AUTO-GENERATED by port/generate-registry.mjs — do not edit by hand.');
  lines.push(` * Source: ${meta.source}`);
  lines.push(` * Generated: ${meta.generatedAt}`);
  lines.push(` * Entries: ${entries.length}`);
  lines.push(' */');
  lines.push('');
  lines.push("import type { ExtractorEntry } from '../types';");
  lines.push("import { GenericIE } from './generic';");
  lines.push("import { ExtractorError, InfoExtractor } from '../common';");
  lines.push('');
  lines.push('/** Implemented extractors are registered separately in index.ts */');
  lines.push('export const IMPLEMENTED_IE_KEYS = new Set([');
  lines.push("  'Youtube',");
  lines.push("  'BiliBili',");
  lines.push("  'Generic',");
  lines.push(']);');
  lines.push('');
  lines.push('class StubIE extends InfoExtractor {');
  lines.push('  static IE_NAME = "stub";');
  lines.push('  static _VALID_URL: RegExp | string | false | null = null;');
  lines.push('  private _meta: { ieName: string; className: string; moduleHint?: string };');
  lines.push('  private _validUrl: RegExp | string | false | null;');
  lines.push('  constructor(meta: { ieName: string; className: string; moduleHint?: string }, validUrl: RegExp | string | false | null) {');
  lines.push('    super();');
  lines.push('    this._meta = meta;');
  lines.push('    this._validUrl = validUrl;');
  lines.push('  }');
  lines.push('  get IE_NAME() { return this._meta.ieName; }');
  lines.push('  suitable(url: string): boolean {');
  lines.push('    const v = this._validUrl;');
  lines.push('    if (v === false || v == null) return false;');
  lines.push('    try {');
  lines.push('      const re = v instanceof RegExp ? v : new RegExp(v);');
  lines.push('      return re.test(url);');
  lines.push('    } catch { return false; }');
  lines.push('  }');
  lines.push('  async _real_extract(_url: string): Promise<import("../types").VideoInfo> {');
  lines.push('    void _url;');
  lines.push('    throw new ExtractorError(');
  lines.push('      `[stub] ${this._meta.className} (${this._meta.ieName}) not implemented in Reader ytdlp runtime` +');
  lines.push('        (this._meta.moduleHint ? ` — see yt-dlp ${this._meta.moduleHint}` : "") +');
  lines.push('        `. Falling back is handled by registry when stub throws.`,');
  lines.push('      { expected: true },');
  lines.push('    );');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('function makeStubEntry(e: {');
  lines.push('  ie_key: string;');
  lines.push('  ie_name: string;');
  lines.push('  className: string;');
  lines.push('  valid_url: string | false | null;');
  lines.push('  module_hint?: string;');
  lines.push('}): ExtractorEntry {');
  lines.push('  return {');
  lines.push('    ie_key: e.ie_key,');
  lines.push('    ie_name: e.ie_name,');
  lines.push('    valid_url: e.valid_url,');
  lines.push('    implemented: false,');
  lines.push('    module_hint: e.module_hint,');
  lines.push('    create: (): InfoExtractor => {');
  lines.push('      if (IMPLEMENTED_IE_KEYS.has(e.ie_key)) {');
  lines.push('        return new GenericIE();');
  lines.push('      }');
  lines.push('      const stub = new StubIE(');
  lines.push('        { ieName: e.ie_name, className: e.className, moduleHint: e.module_hint },');
  lines.push('        e.valid_url === false ? false : e.valid_url,');
  lines.push('      );');
  lines.push('      const original = stub.extract.bind(stub);');
  lines.push('      stub.extract = async (url: string) => {');
  lines.push('        try {');
  lines.push('          return await original(url);');
  lines.push('        } catch {');
  lines.push('          const g = new GenericIE();');
  lines.push('          g.set_downloader(stub.get_downloader());');
  lines.push('          return g.extract(url);');
  lines.push('        }');
  lines.push('      };');
  lines.push('      return stub;');
  lines.push('    },');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push('export const GENERATED_EXTRACTOR_DEFS: Array<{');
  lines.push('  ie_key: string;');
  lines.push('  ie_name: string;');
  lines.push('  className: string;');
  lines.push('  valid_url: string | false | null;');
  lines.push('  module_hint?: string;');
  lines.push('}> = [');

  for (const e of entries) {
    const valid =
      e.validUrl === false
        ? 'false'
        : e.validUrl == null
          ? 'null'
          : tsEscape(e.validUrl);
    lines.push('  {');
    lines.push(`    ie_key: ${tsEscape(e.ieKey)},`);
    lines.push(`    ie_name: ${tsEscape(e.ieName)},`);
    lines.push(`    className: ${tsEscape(e.className)},`);
    lines.push(`    valid_url: ${valid},`);
    if (e.moduleHint) lines.push(`    module_hint: ${tsEscape(e.moduleHint)},`);
    lines.push('  },');
  }

  lines.push('];');
  lines.push('');
  lines.push('export function buildGeneratedExtractorEntries(): ExtractorEntry[] {');
  lines.push('  return GENERATED_EXTRACTOR_DEFS');
  lines.push('    .filter((e) => !IMPLEMENTED_IE_KEYS.has(e.ie_key))');
  lines.push('    .map(makeStubEntry);');
  lines.push('}');
  lines.push('');
  lines.push('export default GENERATED_EXTRACTOR_DEFS;');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findYtDlpRoot(args.ytDlp);
  if (!root) {
    console.error('[generate-registry] yt-dlp root not found. Pass --yt-dlp <path>');
    process.exit(1);
  }
  const extractorDir = path.join(root, 'yt_dlp', 'extractor');
  const extractorsPy = path.join(extractorDir, '_extractors.py');
  console.log(`[generate-registry] Scanning ${extractorDir}`);

  const orderedNames = fs.existsSync(extractorsPy) ? parseExtractorsPy(extractorsPy) : [];
  const pyFiles = walkPyFiles(extractorDir);
  // also youtube package
  const byClass = new Map();

  for (const file of pyFiles) {
    const rel = path.relative(extractorDir, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    for (const c of extractClasses(src, rel)) {
      byClass.set(c.className, c);
    }
  }
  // youtube nested
  const ytDir = path.join(extractorDir, 'youtube');
  if (fs.existsSync(ytDir)) {
    for (const file of walkPyFiles(ytDir)) {
      const rel = path.relative(extractorDir, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf8');
      for (const c of extractClasses(src, rel)) {
        byClass.set(c.className, c);
      }
    }
  }

  // Prefer order from _extractors.py; append orphans
  const ordered = [];
  const seen = new Set();
  for (const name of orderedNames) {
    const c = byClass.get(name);
    if (!c) {
      ordered.push({
        className: name,
        ieName: name.replace(/IE$/, '').toLowerCase(),
        ieKey: name.replace(/IE$/, ''),
        validUrl: null,
        moduleHint: '_extractors.py',
      });
    } else {
      ordered.push(c);
    }
    seen.add(name);
  }
  for (const [name, c] of byClass) {
    if (!seen.has(name)) ordered.push(c);
  }

  const ts = generateTs(ordered, {
    source: root,
    generatedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, ts, 'utf8');
  console.log(`[generate-registry] Wrote ${ordered.length} entries → ${OUT}`);
}

main();
