/**
 * 以指定视频构建配置启动命令。
 * 用法：node scripts/with-video-profile.mjs <profile> -- <cmd> [args...]
 *
 * 默认产品形态为 artplayer-only（轻量：Artplayer + 外置）；enhanced 才暴露内嵌 libmpv / Media3 / Anime4K·RIFE 并允许编入 AAR。
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

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

function usage() {
  console.error(
    'Usage: node scripts/with-video-profile.mjs <profile> -- <command> [args...]',
  );
  console.error(`Profiles: ${Object.keys(PROFILE_ENV).join(', ')}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 1) usage();

const profile = argv[0];
const cmdArgs = argv.slice(sep + 1);
if (!cmdArgs.length) usage();

const envPatch = PROFILE_ENV[profile];
if (!envPatch) {
  console.error(`Unknown video profile: ${profile}`);
  usage();
}

const [command, ...args] = cmdArgs;
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: true,
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
