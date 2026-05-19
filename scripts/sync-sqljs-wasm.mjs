/**
 * 将 sql.js 的 sql-wasm.wasm 同步到 public/sql.js/（npm 包内常不含 wasm 文件）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const SQLJS_VERSION = (() => {
  try {
    const pkg = require('sql.js/package.json');
    return pkg.version || '1.14.0';
  } catch {
    return '1.14.0';
  }
})();

function findWasmInNodeModules() {
  const candidates = [
    path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  try {
    const pkgDir = path.dirname(require.resolve('sql.js/package.json'));
    candidates.unshift(path.join(pkgDir, 'dist', 'sql-wasm.wasm'));
  } catch {
    /* ignore */
  }

  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const name of fs.readdirSync(pnpmDir)) {
      if (!name.startsWith('sql.js@')) continue;
      candidates.push(
        path.join(pnpmDir, name, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
      );
    }
  }

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function downloadWasm(dest) {
  const url = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/sql-wasm.wasm`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败 ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf[0] !== 0x00 || buf[1] !== 0x61) {
    throw new Error('下载内容不是有效的 wasm 文件');
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

const destDir = path.join(root, 'public', 'sql.js');
const dest = path.join(destDir, 'sql-wasm.wasm');

const src = findWasmInNodeModules();
if (src) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('[sync-sqljs-wasm] 已从 node_modules 复制', dest, `(${(fs.statSync(dest).size / 1024).toFixed(0)} KiB)`);
} else {
  try {
    await downloadWasm(dest);
    console.log('[sync-sqljs-wasm] 已从 CDN 下载', dest, `(${(fs.statSync(dest).size / 1024).toFixed(0)} KiB)`);
  } catch (e) {
    console.error('[sync-sqljs-wasm] 失败:', e);
    process.exit(1);
  }
}
