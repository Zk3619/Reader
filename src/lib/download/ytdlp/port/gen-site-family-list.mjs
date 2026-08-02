#!/usr/bin/env node
/**
 * 生成全站族验收清单：对照上游 _extractors.py + Reader HAND_OVERRIDES / generated-registry。
 *
 * Usage:
 *   node src/lib/download/ytdlp/port/gen-site-family-list.mjs
 *   node src/lib/download/ytdlp/port/gen-site-family-list.mjs --yt-dlp d:\Projects\Download\yt-dlp-master --out docs/YTDLP_SITE_FAMILIES.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readerRoot = path.resolve(__dirname, '../../../../..');

function findYtDlp(explicit) {
  const candidates = [
    explicit,
    process.env.YT_DLP_ROOT,
    path.resolve(readerRoot, '../Download/yt-dlp-master'),
    'd:/Projects/Download/yt-dlp-master',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'yt_dlp', 'extractor', '_extractors.py'))) return c;
  }
  return null;
}

const args = process.argv.slice(2);
let yt = null;
let outPath = path.join(readerRoot, 'docs', 'YTDLP_SITE_FAMILIES.md');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--yt-dlp') yt = args[++i];
  if (args[i] === '--out') outPath = path.resolve(args[++i]);
}

const root = findYtDlp(yt);
if (!root) {
  console.error('yt-dlp root not found');
  process.exit(1);
}

const regPath = path.resolve(__dirname, '../extractors/generated-registry.ts');
const regText = fs.readFileSync(regPath, 'utf8');

const handMatch = regText.match(/export const HAND_OVERRIDES = new Set\(\[([\s\S]*?)\]\);/);
const handKeys = new Set(
  [...(handMatch?.[1] || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

/** @type {Array<{ie_key:string, ie_name:string, className:string, valid_url:unknown, module_hint:string}>} */
const defs = [];
for (const m of regText.matchAll(
  /\{\s*ie_key:\s*"([^"]+)",\s*ie_name:\s*"([^"]*)",\s*className:\s*"([^"]+)",\s*valid_url:\s*([\s\S]*?),\s*module_hint:\s*"([^"]*)",?\s*\}/g,
)) {
  defs.push({
    ie_key: m[1],
    ie_name: m[2],
    className: m[3],
    valid_url: m[4].trim(),
    module_hint: m[5] || '(unknown)',
  });
}

const extractorsPy = fs.readFileSync(
  path.join(root, 'yt_dlp', 'extractor', '_extractors.py'),
  'utf8',
);
const upstreamClasses = [
  ...new Set([...extractorsPy.matchAll(/\b([A-Za-z0-9_]+IE)\b/g)].map((m) => m[1])),
].filter((c) => c !== 'InfoExtractor');

const regClassSet = new Set(defs.map((d) => d.className));
const missingUpstream = upstreamClasses.filter((c) => !regClassSet.has(c));

function familyName(hint) {
  if (!hint || hint === '(unknown)') return '_ungrouped';
  return hint.replace(/\\/g, '/').replace(/\.py$/, '');
}

/** @type {Map<string, typeof defs>} */
const byFamily = new Map();
for (const d of defs) {
  const fam = familyName(d.module_hint);
  if (!byFamily.has(fam)) byFamily.set(fam, []);
  byFamily.get(fam).push(d);
}

const families = [...byFamily.keys()].sort((a, b) => a.localeCompare(b));

function statusOf(d) {
  if (handKeys.has(d.ie_key)) return 'hand';
  if (d.valid_url === 'false' || d.valid_url === 'null as any' || d.valid_url === 'null') {
    return 'generated-base';
  }
  return 'generated';
}

const statusLabel = {
  hand: '手写精品',
  generated: '转译 IE',
  'generated-base': '转译基类/无 URL',
};

let genCount = 0;
let baseCount = 0;
for (const d of defs) {
  const s = statusOf(d);
  if (s === 'generated-base') baseCount++;
  else if (s !== 'hand') genCount++;
}

const today = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push('# yt-dlp 全站族验收清单');
lines.push('');
lines.push('> 自动生成：对照上游 `_extractors.py` 与 Reader `generated-registry.ts` / `HAND_OVERRIDES`。');
lines.push(`> 生成日期：${today}`);
lines.push(`> 上游钉扎：\`${root.replace(/\\/g, '/')}\``);
lines.push('> 重新生成：`node src/lib/download/ytdlp/port/gen-site-family-list.mjs --yt-dlp <yt-dlp-root>`');
lines.push('');
lines.push('## 统计');
lines.push('');
lines.push('| 项 | 数量 |');
lines.push('|----|------|');
lines.push(`| 上游 \`_extractors.py\` IE 类 | ${upstreamClasses.length} |`);
lines.push(`| Reader registry 条目 | ${defs.length} |`);
lines.push(`| 站族（按 \`module_hint\`） | ${families.length} |`);
const handInDefs = defs.filter((d) => handKeys.has(d.ie_key)).length;
const handOrphans = [...handKeys].filter((k) => !defs.some((d) => d.ie_key === k)).sort();

lines.push(`| **手写精品** (\`HAND_OVERRIDES\` ∩ registry) | ${handInDefs} |`);
lines.push(`| HAND_OVERRIDES 总数 | ${handKeys.size} |`);
if (handOrphans.length) {
  lines.push(`| HAND_OVERRIDES 无 registry 条目 | ${handOrphans.length}（见文末） |`);
}
lines.push(`| 转译 IE（有 URL） | ${genCount} |`);
lines.push(`| 转译基类 / 无 URL | ${baseCount} |`);
lines.push(
  `| 上游有、registry 缺 className | ${missingUpstream.length} |`,
);
lines.push(
  `| 覆盖率（className） | ${(((upstreamClasses.length - missingUpstream.length) / Math.max(1, upstreamClasses.length)) * 100).toFixed(2)}% |`,
);
lines.push('');
lines.push('## 状态图例');
lines.push('');
lines.push('| 状态 | 含义 | 验收期望 |');
lines.push('|------|------|----------|');
lines.push('| 手写精品 | `HAND_OVERRIDES`，真实 `_real_extract` | 样例 URL `extract_info` 出 formats/url；主路径对齐上游 |');
lines.push('| 转译 IE | generated 移植壳 | 路由命中；能跑则更好，不保证主路径对等 |');
lines.push('| 转译基类/无 URL | 基类或 suitable=False | 不直接匹配 URL |');
lines.push('');
lines.push('## 手写精品一览（对齐优先）');
lines.push('');
lines.push('| ie_key | IE 类 | 站族文件 |');
lines.push('|--------|-------|----------|');
for (const d of defs.filter((x) => handKeys.has(x.ie_key)).sort((a, b) => a.ie_key.localeCompare(b.ie_key))) {
  lines.push(`| \`${d.ie_key}\` | \`${d.className}\` | \`${d.module_hint}\` |`);
}
lines.push('');
lines.push('## 按站族明细');
lines.push('');

for (const fam of families) {
  const items = byFamily.get(fam).sort((a, b) => a.ie_key.localeCompare(b.ie_key));
  const handInFam = items.filter((d) => handKeys.has(d.ie_key)).length;
  lines.push(`### \`${fam}\`（${items.length} IE，手写 ${handInFam}）`);
  lines.push('');
  lines.push('| ie_key | className | 状态 |');
  lines.push('|--------|-----------|------|');
  for (const d of items) {
    const st = statusOf(d);
    lines.push(`| \`${d.ie_key}\` | \`${d.className}\` | ${statusLabel[st]} |`);
  }
  lines.push('');
}

if (handOrphans.length) {
  lines.push('## HAND_OVERRIDES 无 registry defs 条目');
  lines.push('');
  lines.push('（通常为仅手写、未出现在 GENERATED_EXTRACTOR_DEFS 的 key；仍应在 `index.ts` 注册）');
  lines.push('');
  for (const k of handOrphans) {
    lines.push(`- \`${k}\``);
  }
  lines.push('');
}

if (missingUpstream.length) {
  lines.push('## 上游有、Reader registry 缺失的 className');
  lines.push('');
  for (const c of missingUpstream.sort()) {
    lines.push(`- \`${c}\``);
  }
  lines.push('');
}

lines.push('## 验收建议');
lines.push('');
lines.push('1. **手写精品**：按 `docs/DOWNLOAD_MODULE.md` 冒烟 URL 跑 `extract_info`；失败记入站内 gap。');
lines.push('2. **转译 IE**：抽样路由 `getExtractorForUrl` 命中且非 Generic；网络提取失败可接受。');
lines.push('3. **加深优先级**：同站族内仍有「转译 IE」的，优先把高频附属类升入手写（见 gap 分析）。');
lines.push('4. 本文件为清单真相源之一；改 `HAND_OVERRIDES` / 重新 transpile 后应重跑本脚本。');
lines.push('');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(
  JSON.stringify(
    {
      out: outPath,
      families: families.length,
      defs: defs.length,
      handOverrides: handKeys.size,
      handInDefs,
      handOrphans,
      missingUpstream: missingUpstream.length,
    },
    null,
    2,
  ),
);
