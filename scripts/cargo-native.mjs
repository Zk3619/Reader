/**
 * 在补齐原生构建环境后运行 cargo。
 *
 * - 默认 / 无 tls-impersonate：不探测、不注入原生工具链
 * - `--features tls-impersonate` 或 READER_TLS_IMPERSONATE=1：完整 BoringSSL 工具链
 *
 *   pnpm cargo:native check
 *   pnpm cargo:native check --features tls-impersonate
 *
 * 见 docs/HTTP_CLIENT.md。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  androidNativeBuildEnv,
  windowsNativeBuildEnv,
} from './native-build-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function envFlagOn(name) {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

function argsWantTls(argv) {
  if (envFlagOn('READER_SKIP_TLS_IMPERSONATE')) return false;
  if (envFlagOn('READER_TLS_IMPERSONATE')) return true;
  return argv.some((a) => a.includes('tls-impersonate'));
}

const wantTls = argsWantTls(args);
const nativeEnv = windowsNativeBuildEnv(root, { full: wantTls });
const androidEnv =
  wantTls && args.some((a) => a.includes('android'))
    ? androidNativeBuildEnv({ ...process.env, ...nativeEnv }, root)
    : {};

const child = spawn('cargo', args, {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(root, 'src-tauri'),
  env: { ...process.env, ...nativeEnv, ...androidEnv },
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
