/**
 * 将 QuickJS WASM 同步到 public/quickjs/，供 dev server 与 BASE_URL 相对路径加载
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function findWasmSource() {
  try {
    const pkgDir = path.dirname(require.resolve('@jitl/quickjs-wasmfile-release-sync/package.json'));
    const candidate = path.join(pkgDir, 'dist', 'emscripten-module.wasm');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* pnpm 嵌套依赖时 require 可能失败 */
  }

  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    for (const name of fs.readdirSync(pnpmDir)) {
      if (!name.startsWith('@jitl+quickjs-wasmfile-release-sync@')) continue;
      const candidate = path.join(
        pnpmDir,
        name,
        'node_modules',
        '@jitl',
        'quickjs-wasmfile-release-sync',
        'dist',
        'emscripten-module.wasm'
      );
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

const src = findWasmSource();
const destDir = path.join(root, 'public', 'quickjs');
const dest = path.join(destDir, 'emscripten-module.wasm');

if (!src) {
  console.warn('[sync-quickjs-wasm] 未找到 quickjs wasm，请先 pnpm install');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[sync-quickjs-wasm]', dest, `(${(fs.statSync(dest).size / 1024).toFixed(0)} KiB)`);
