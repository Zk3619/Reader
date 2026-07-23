/**
 * 解析 Anime4K shaders 目录：用户配置优先，否则捆绑 resources/shaders
 */

import { ANIME4K_BUNDLED_SHADER_DIR_NAME } from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

let cachedBundledDir: string | null | undefined;

/** 开发态：相对 src-tauri/resources/shaders（仅提示/非 Tauri 时） */
export const ANIME4K_DEV_SHADERS_HINT = 'src-tauri/resources/shaders';

const PROBE_SHADER = 'Anime4K_Clamp_Highlights.glsl';

async function pathExists(path: string): Promise<boolean> {
  if (!path.trim()) return false;
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    return await exists(path);
  } catch {
    return false;
  }
}

async function dirHasAnime4KShaders(dir: string): Promise<boolean> {
  const root = dir.replace(/[/\\]+$/, '');
  if (!root) return false;
  try {
    const { join } = await import('@tauri-apps/api/path');
    return pathExists(await join(root, PROBE_SHADER));
  } catch {
    const sep = root.includes('\\') ? '\\' : '/';
    return pathExists(`${root}${sep}${PROBE_SHADER}`);
  }
}

/**
 * 异步解析有效 shaders 根目录。
 * - 偏好非空 → 原样返回
 * - 否则优先走 Rust 多候选探测（resourceDir / resources/shaders / 开发 cwd）
 * - 失败返回 ''（仅文件名时 mpv 几乎找不到）
 */
export async function resolveEffectiveAnime4KShadersDir(): Promise<string> {
  const prefs = getVideoPlaybackPrefs();
  const custom = prefs.anime4kShadersDir.trim();
  if (custom) return custom.replace(/[/\\]+$/, '');

  if (cachedBundledDir !== undefined) {
    return cachedBundledDir ?? '';
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const dir = await invoke<string>('video_resolve_anime4k_shaders_dir');
    const cleaned = (dir || '').trim().replace(/[/\\]+$/, '');
    if (cleaned) {
      cachedBundledDir = cleaned;
      return cleaned;
    }
  } catch {
    /* 非桌面 / 旧构建：回退 resourceDir */
  }

  try {
    const { resourceDir, join } = await import('@tauri-apps/api/path');
    const base = await resourceDir();
    for (const rel of [
      [ANIME4K_BUNDLED_SHADER_DIR_NAME],
      ['resources', ANIME4K_BUNDLED_SHADER_DIR_NAME],
    ] as string[][]) {
      const dir = await join(base, ...rel);
      if (await dirHasAnime4KShaders(dir)) {
        cachedBundledDir = dir;
        return dir;
      }
    }
    const fallback = await join(base, ANIME4K_BUNDLED_SHADER_DIR_NAME);
    cachedBundledDir = fallback;
    return fallback;
  } catch {
    cachedBundledDir = null;
    return '';
  }
}

/** 仅探测 Shader 文件是否存在（忽略 Mode / VO，供设置页可用性） */
export async function probeAnime4KShadersPresent(): Promise<{
  ready: boolean;
  dir: string;
  detail: string;
}> {
  const dir = await resolveEffectiveAnime4KShadersDir();
  if (!dir) {
    return {
      ready: false,
      dir: '',
      detail: `未找到捆绑 Shaders（期望 ${ANIME4K_DEV_SHADERS_HINT}）`,
    };
  }
  if (!(await dirHasAnime4KShaders(dir))) {
    return {
      ready: false,
      dir,
      detail: `目录无 ${PROBE_SHADER}：${dir}`,
    };
  }
  return { ready: true, dir, detail: dir };
}

/** 探测超分资源是否就绪（开播前；含 Mode / VO 策略） */
export async function probeAnime4KShadersReady(): Promise<{
  ready: boolean;
  dir: string;
  detail: string;
}> {
  const prefs = getVideoPlaybackPrefs();
  if (prefs.anime4kMode === 'off') {
    return { ready: true, dir: '', detail: 'Anime4K 已关闭' };
  }
  const { resolveMpvLaunchOpts } = await import(
    '@/lib/media/video/playback/mpv-launch'
  );
  const launch = resolveMpvLaunchOpts(prefs);
  if (!launch.anime4kOn) {
    return {
      ready: false,
      dir: '',
      detail:
        '当前 Video Output / 策略组合下 Anime4K 不会生效（例如 GPU-Next 且未强制 GPU）',
    };
  }
  return probeAnime4KShadersPresent();
}

/** 测试或强制刷新缓存 */
export function clearAnime4KShadersDirCache(): void {
  cachedBundledDir = undefined;
}
