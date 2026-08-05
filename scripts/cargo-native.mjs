/**
 * 在补齐原生构建环境（MSVC / Ninja / NASM / libclang）后运行 cargo。
 * 用于不经 tauri 的裸命令，例如：
 *
 *   pnpm cargo:native check
 *   pnpm cargo:native build --release
 *   pnpm cargo:native tree -i openssl-sys
 *   pnpm cargo:native check --target aarch64-linux-android
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

const nativeEnv = windowsNativeBuildEnv(root);
const androidEnv = args.some((a) => a.includes('android'))
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
