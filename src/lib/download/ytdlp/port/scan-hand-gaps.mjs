#!/usr/bin/env node
/**
 * Scan hand-* extractors for simplification / gap comments → HAND_REGRESSION_GAPS.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extractorsDir = path.resolve(__dirname, '../extractors');
const outPath = path.resolve(__dirname, '../../../../../docs/YTDLP_HAND_REGRESSION_GAPS.md');

const PATTERNS = [
  /Upstream uses impersonate/i,
  /not implemented/i,
  /not available in this runtime/i,
  /AES decryption is not/i,
  /pragmatic port/i,
  /Known simplif/i,
  /有意简化/i,
  /未完整复刻/i,
  /best-effort/i,
];

const rows = [];
for (const dir of fs.readdirSync(extractorsDir)) {
  if (!dir.startsWith('hand-')) continue;
  const handPath = path.join(extractorsDir, dir);
  if (!fs.statSync(handPath).isDirectory()) continue;
  for (const f of fs.readdirSync(handPath).filter((n) => n.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(handPath, f), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERNS.some((p) => p.test(line))) continue;
      const ieMatch = text.match(/export (?:abstract )?class (\w+IE)/);
      rows.push({
        batch: dir,
        file: f,
        line: i + 1,
        ie: ieMatch?.[1] || f.replace(/\.ts$/, ''),
        note: line.trim().replace(/\s+/g, ' ').slice(0, 160),
      });
    }
  }
}

const byFile = new Map();
for (const r of rows) {
  const k = `${r.batch}/${r.file}`;
  if (!byFile.has(k)) byFile.set(k, []);
  byFile.get(k).push(r);
}

const lines = [];
lines.push('# yt-dlp 手写 IE 行为回归清单');
lines.push('');
lines.push('> 自动生成：扫描 `hand-*` 中简化/缺失注释。');
lines.push(`> 生成时间：${new Date().toISOString().slice(0, 10)}`);
lines.push('> 命令：`node src/lib/download/ytdlp/port/scan-hand-gaps.mjs`');
lines.push('');
lines.push(`共 **${rows.length}** 处标记，**${byFile.size}** 个文件。`);
lines.push('');
lines.push('## 优先级建议');
lines.push('');
lines.push('| 优先级 | 模式 | 动作 |');
lines.push('|--------|------|------|');
lines.push('| P0 | `impersonate` | 启用 `YoutubeDLOptions.impersonate` + 后端 HTTP |');
lines.push('| P0 | `AES decryption` | 补浏览器 AES/HLS key 解密或明确 DRM 边界 |');
lines.push('| P1 | `not implemented` / `pragmatic` | 对齐上游主路径或降级为 expected 错误 |');
lines.push('| P2 | `best-effort` | 文档化 + 样例 URL 冒烟 |');
lines.push('');
lines.push('## 文件明细');
lines.push('');

for (const [file, items] of [...byFile.entries()].sort()) {
  lines.push(`### \`${file}\`（${items.length}）`);
  lines.push('');
  lines.push('| 行 | IE | 注释 |');
  lines.push('|----|-----|------|');
  for (const it of items) {
    const note = it.note.replace(/\|/g, '\\|');
    lines.push(`| ${it.line} | ${it.ie} | ${note} |`);
  }
  lines.push('');
}

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ hits: rows.length, files: byFile.size, out: outPath }, null, 2));
