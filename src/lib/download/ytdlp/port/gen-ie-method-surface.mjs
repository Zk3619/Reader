/**
 * Generate YTDLP_IE_METHOD_SURFACE.md — Reader common.ts vs yt-dlp common.py.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commonTsPath = path.resolve(__dirname, '../common.ts');
const commonTs = fs.readFileSync(commonTsPath, 'utf8');
const readerRoot = path.resolve(__dirname, '../../../../..');
const commonPyPath = path.resolve(readerRoot, '../Download/yt-dlp-master/yt_dlp/extractor/common.py');
const commonPy = fs.existsSync(commonPyPath)
  ? fs.readFileSync(commonPyPath, 'utf8')
  : '';

const tsMethods = new Set(
  [...commonTs.matchAll(/^\s+(async\s+)?(_?[a-zA-Z][\w]*)\s*\(/gm)].map((m) => m[2]),
);
const pyMethods = new Set(
  [...commonPy.matchAll(/^\s{4}def ([a-zA-Z_][\w]*)\(/gm)].map((m) => m[1]),
);

const corePy = [...pyMethods].filter((m) => m.startsWith('_') || ['extract', 'suitable', 'url_result', 'playlist_result'].includes(m));
const coreTs = [...tsMethods].filter((m) => m.startsWith('_') || ['extract', 'suitable', 'url_result', 'playlist_result'].includes(m));

const ported = corePy.filter((m) => coreTs.includes(m)).sort();
const missing = corePy.filter((m) => !coreTs.includes(m)).sort();
const readerOnly = coreTs.filter((m) => !corePy.includes(m)).sort();

const out = `# yt-dlp InfoExtractor 方法面对照

> 自动生成：node src/lib/download/ytdlp/port/gen-ie-method-surface.mjs

| 指标 | Python common.py | Reader common.ts |
|------|------------------|------------------|
| 类方法（def） | ${pyMethods.size} | ${tsMethods.size} |
| 核心 IE 方法 | ${corePy.length} | ${coreTs.length} |
| 已移植核心方法 | ${ported.length} | — |
| 未移植核心方法 | ${missing.length} | — |
| Reader 扩展 | — | ${readerOnly.length} |

## 已移植核心方法（${ported.length}）

${ported.map((m) => `- ${m}`).join('\n')}

## 未移植核心方法（${missing.length}，节选）

${missing.slice(0, 60).map((m) => `- ${m}`).join('\n')}
${missing.length > 60 ? `\n… 另有 ${missing.length - 60} 项（多为站点专用或 LazyList 内部）` : ''}

## Reader 扩展方法

${readerOnly.map((m) => `- ${m}`).join('\n')}

## 说明

- hand-* IE 内 camelCase 方法（如 _callApi）为站点私有实现，不计入 common 表面。
- 下载编排（break_on_existing / playlist_items / download_archive）在 youtube-dl.ts。
- RTMP/WebSocket 见 protocol-policy.ts；HDS bootstrap 见 f4m-native.ts。
`;

const outPath = path.join(readerRoot, 'docs/YTDLP_IE_METHOD_SURFACE.md');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${outPath}`);
