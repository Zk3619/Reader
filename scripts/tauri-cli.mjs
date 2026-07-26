/**
 * Tauri CLI 包装：默认 Artplayer-only（含外置）；参数含 enhanced / --enhanced 时切增强配置（libmpv 等）。
 *
 * 例：
 *   pnpm tauri dev
 *   pnpm tauri build
 *   pnpm tauri android dev
 *   pnpm tauri dev enhanced
 *   pnpm tauri enhanced build
 *   pnpm tauri android build --enhanced
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const enhancedConfig = path.join(root, 'src-tauri', 'tauri.enhanced.conf.json');

const PROFILE_ENV = {
  'artplayer-only': {
    VITE_VIDEO_PROFILE: 'artplayer-only',
    READER_VIDEO_ENHANCED: '0',
  },
  enhanced: {
    VITE_VIDEO_PROFILE: 'enhanced',
    READER_VIDEO_ENHANCED: '1',
  },
};

function isEnhancedToken(arg) {
  return arg === 'enhanced' || arg === '--enhanced';
}

const rawArgs = process.argv.slice(2);
const enhanced = rawArgs.some(isEnhancedToken);
const tauriArgs = rawArgs.filter((a) => !isEnhancedToken(a));

if (enhanced) {
  const hasFeatures = tauriArgs.some(
    (a, i) =>
      a === '--features' ||
      a.startsWith('--features=') ||
      (tauriArgs[i - 1] === '--features'),
  );
  const hasConfig = tauriArgs.some(
    (a, i) =>
      a === '--config' ||
      a.startsWith('--config=') ||
      (tauriArgs[i - 1] === '--config'),
  );

  // 桌面 dev/build：自动补 feature + enhanced conf（android 子命令不加 desktop config）
  const isAndroid = tauriArgs[0] === 'android';
  const sub = isAndroid ? tauriArgs[1] : tauriArgs[0];
  const isDesktopDevOrBuild = !isAndroid && (sub === 'dev' || sub === 'build');

  if (isDesktopDevOrBuild && !hasFeatures) {
    tauriArgs.push('--features', 'video-libmpv');
  }
  if (isDesktopDevOrBuild && !hasConfig) {
    tauriArgs.push('--config', enhancedConfig);
  }
}

const profile = enhanced ? 'enhanced' : 'artplayer-only';
const envPatch = PROFILE_ENV[profile];

const child = spawn('tauri', tauriArgs, {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: { ...process.env, ...envPatch },
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
