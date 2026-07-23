/**
 * 解析 Anime4K shaders 目录：用户配置优先，否则捆绑 resources/shaders
 */

import { ANIME4K_BUNDLED_SHADER_DIR_NAME } from '@/lib/media/video/playback/anime4k';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

let cachedBundledDir: string | null | undefined;

/** 开发态：相对 src-tauri/resources/shaders（仅提示/非 Tauri 时） */
export const ANIME4K_DEV_SHADERS_HINT = 'src-tauri/resources/shaders';

/**
 * 异步解析有效 shaders 根目录。
 * - 偏好非空 → 原样返回
 * - 否则尝试 Tauri resourceDir/shaders
 * - 失败返回 ''（仅文件名，依赖 mpv 工作目录）
 */
export async function resolveEffectiveAnime4KShadersDir(): Promise<string> {
  const prefs = getVideoPlaybackPrefs();
  const custom = prefs.anime4kShadersDir.trim();
  if (custom) return custom.replace(/[/\\]+$/, '');

  if (cachedBundledDir !== undefined) {
    return cachedBundledDir ?? '';
  }

  try {
    const { resourceDir, join } = await import('@tauri-apps/api/path');
    const base = await resourceDir();
    const dir = await join(base, ANIME4K_BUNDLED_SHADER_DIR_NAME);
    cachedBundledDir = dir;
    return dir;
  } catch {
    cachedBundledDir = null;
    return '';
  }
}

/** 测试或强制刷新缓存 */
export function clearAnime4KShadersDirCache(): void {
  cachedBundledDir = undefined;
}
