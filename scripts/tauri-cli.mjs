/**
 * Tauri CLI 包装：默认 Artplayer-only；参数含 enhanced / --enhanced 时切增强配置（libmpv 等）。
 * 出站 HTTP / JA3（wreq）已默认编入，不再依赖 Cargo feature `tls-impersonate`。
 *
 * 例：
 *   pnpm tauri:dev:lite
 *   pnpm tauri:dev:enhanced
 *   pnpm tauri:build:enhanced
 *   READER_SKIP_TLS_IMPERSONATE=1 pnpm tauri …   # 仅关闭前端 JA3 门控
 *
 * Windows BoringSSL：PATH 需 NASM≥2.16.03；建议 VsDevCmd + CMAKE_GENERATOR=Ninja。
 * Android：ANDROID_NDK_HOME + ANDROID_PLATFORM=android-24（见 docs/HTTP_CLIENT.md）。
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
const enhancedConfig = path.join(root, 'src-tauri', 'tauri.enhanced.conf.json');

function isEnhancedToken(arg) {
  return arg === 'enhanced' || arg === '--enhanced';
}

const rawArgs = process.argv.slice(2);
const enhanced = rawArgs.some(isEnhancedToken);
const tauriArgs = rawArgs.filter((a) => !isEnhancedToken(a));

const skipTls =
  process.env.READER_SKIP_TLS_IMPERSONATE === '1' ||
  process.env.READER_SKIP_TLS_IMPERSONATE === 'true';

const PROFILE_ENV = {
  'artplayer-only': {
    VITE_VIDEO_PROFILE: 'artplayer-only',
    READER_VIDEO_ENHANCED: '0',
    // wreq JA3 默认可用；显式 skip 时关闭前端调用
    VITE_YTDLP_TLS_IMPERSONATE: skipTls ? '0' : '1',
  },
  enhanced: {
    VITE_VIDEO_PROFILE: 'enhanced',
    READER_VIDEO_ENHANCED: '1',
    VITE_YTDLP_TLS_IMPERSONATE: skipTls ? '0' : '1',
  },
};

if (enhanced) {
  const hasFeatures = tauriArgs.some(
    (a, i) =>
      a === '--features' ||
      a.startsWith('--features=') ||
      tauriArgs[i - 1] === '--features',
  );
  const hasConfig = tauriArgs.some(
    (a, i) =>
      a === '--config' ||
      a.startsWith('--config=') ||
      tauriArgs[i - 1] === '--config',
  );

  const isAndroid = tauriArgs[0] === 'android';
  const sub = isAndroid ? tauriArgs[1] : tauriArgs[0];
  const isDesktopDevOrBuild = !isAndroid && (sub === 'dev' || sub === 'build');

  // enhanced：仅追加 libmpv；tls-impersonate 为空 feature 别名，无需再带
  if (isDesktopDevOrBuild && !hasFeatures) {
    tauriArgs.push('--features', 'video-libmpv');
  }
  if (isDesktopDevOrBuild && !hasConfig) {
    tauriArgs.push('--config', enhancedConfig);
  }
}

const profile = enhanced ? 'enhanced' : 'artplayer-only';
const envPatch = PROFILE_ENV[profile];

// BoringSSL（wreq）需要 MSVC 环境 + Ninja + NASM≥2.16.03；Android 还需 API≥24 的 CRT
const nativeEnv = windowsNativeBuildEnv(root);
const androidEnv =
  tauriArgs[0] === 'android'
    ? androidNativeBuildEnv({ ...process.env, ...nativeEnv }, root)
    : {};

const child = spawn('tauri', tauriArgs, {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: { ...process.env, ...nativeEnv, ...androidEnv, ...envPatch },
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
