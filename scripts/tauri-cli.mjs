/**
 * Tauri CLI 包装：默认 Artplayer-only；参数含 enhanced / --enhanced 时切增强配置（libmpv 等）。
 *
 * 出站 HTTP 默认走 reqwest（无 BoringSSL）。JA3（wreq）为可选 Cargo feature `tls-impersonate`：
 *   - enhanced 默认开启
 *   - lite 可用 READER_TLS_IMPERSONATE=1 单独开启
 *   - READER_SKIP_TLS_IMPERSONATE=1 强制关闭（含 enhanced）
 *
 * 例：
 *   pnpm tauri:dev:lite
 *   pnpm tauri:dev:enhanced
 *   READER_TLS_IMPERSONATE=1 pnpm tauri:dev:lite
 *   READER_SKIP_TLS_IMPERSONATE=1 pnpm tauri:dev:enhanced
 *
 * Windows BoringSSL（仅 tls-impersonate）：PATH 需 NASM≥2.16.03；建议 VsDevCmd + CMAKE_GENERATOR=Ninja。
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

function envFlagOn(name) {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

function envFlagOff(name) {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

const rawArgs = process.argv.slice(2);
const enhanced = rawArgs.some(isEnhancedToken);
const tauriArgs = rawArgs.filter((a) => !isEnhancedToken(a));

const skipTls = envFlagOff('READER_SKIP_TLS_IMPERSONATE');
const forceTls = envFlagOn('READER_TLS_IMPERSONATE');
/** enhanced 默认开 JA3；lite 仅在强制时开启；skip 优先 */
const wantTls = !skipTls && (forceTls || enhanced);

const PROFILE_ENV = {
  'artplayer-only': {
    VITE_VIDEO_PROFILE: 'artplayer-only',
    READER_VIDEO_ENHANCED: '0',
    VITE_YTDLP_TLS_IMPERSONATE: wantTls ? '1' : '0',
  },
  enhanced: {
    VITE_VIDEO_PROFILE: 'enhanced',
    READER_VIDEO_ENHANCED: '1',
    VITE_YTDLP_TLS_IMPERSONATE: wantTls ? '1' : '0',
  },
};

const isAndroid = tauriArgs[0] === 'android';
const sub = isAndroid ? tauriArgs[1] : tauriArgs[0];
const isDesktopDevOrBuild = !isAndroid && (sub === 'dev' || sub === 'build');
const isAndroidDevOrBuild = isAndroid && (sub === 'dev' || sub === 'build');

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

if (!hasFeatures && (isDesktopDevOrBuild || isAndroidDevOrBuild)) {
  const features = [];
  if (enhanced && isDesktopDevOrBuild) {
    // 与影视 libmpv 同构：内置 ffmpeg-next 主路，外部 ffmpeg CLI 兜底
    features.push('video-libmpv', 'media-ffmpeg');
  }
  if (wantTls) {
    features.push('tls-impersonate');
  }
  if (features.length) {
    tauriArgs.push('--features', features.join(','));
  }
}

if (enhanced && isDesktopDevOrBuild && !hasConfig) {
  tauriArgs.push('--config', enhancedConfig);
}

const profile = enhanced ? 'enhanced' : 'artplayer-only';
const envPatch = PROFILE_ENV[profile];

// lite：不探测原生工具链；full 仅 tls-impersonate
const nativeEnv = windowsNativeBuildEnv(root, { full: wantTls });
const androidEnv =
  wantTls && tauriArgs[0] === 'android'
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
