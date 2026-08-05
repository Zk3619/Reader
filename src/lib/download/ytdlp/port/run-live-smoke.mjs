/**
 * Write docs/YTDLP_LIVE_SMOKE_RESULTS.md — run via vitest export.
 * Usage (PowerShell):
 *   $env:YTDLP_LIVE_SMOKE='1'; npx vitest run src/test/lib/download/ytdlp-live-smoke.test.ts
 * Or capture from test log manually.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readerRoot = path.resolve(__dirname, '../../../..');

const proc = spawnSync(
  'npx',
  ['vitest', 'run', 'src/test/lib/download/ytdlp-live-smoke.test.ts'],
  {
    cwd: readerRoot,
    env: { ...process.env, YTDLP_LIVE_SMOKE: '1', CI: 'false' },
    encoding: 'utf8',
    shell: true,
  },
);

const log = `${proc.stdout || ''}\n${proc.stderr || ''}`;
const rows = [...log.matchAll(/\[live-smoke\] (\w+[-\w]*): (OK|FAIL) (.*)/g)].map((m) => ({
  site: m[1],
  ok: m[2] === 'OK',
  detail: m[3]?.trim(),
}));

const lines = [
  '# yt-dlp 真 URL 冒烟结果',
  '',
  `> 生成时间：${new Date().toISOString().slice(0, 10)}`,
  '> 命令：`YTDLP_LIVE_SMOKE=1 npx vitest run src/test/lib/download/ytdlp-live-smoke.test.ts`',
  '',
  '| 站点 | 结果 | 详情 |',
  '|------|------|------|',
];

if (rows.length) {
  for (const r of rows) {
    lines.push(`| ${r.site} | ${r.ok ? 'OK' : 'FAIL'} | ${r.detail?.replace(/\|/g, '\\|').slice(0, 120)} |`);
  }
} else {
  lines.push('| — | — | 未捕获 live-smoke 日志；检查网络或 vitest 输出 |');
}

lines.push('', '## vitest 输出（节选）', '', '```', log.slice(-4000), '```');

const out = path.join(readerRoot, 'docs/YTDLP_LIVE_SMOKE_RESULTS.md');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${out}`);
if (proc.status !== 0) process.exit(proc.status ?? 1);
