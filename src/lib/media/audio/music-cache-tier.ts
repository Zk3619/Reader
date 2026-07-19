/**
 * 音乐音频缓存分级：auto=播放自动写入（可淘汰）；manual=用户下载/离线（仅用户清除）
 */

export type MusicCacheTier = 'auto' | 'manual';

export const MUSIC_CACHE_TIER_AUTO: MusicCacheTier = 'auto';
export const MUSIC_CACHE_TIER_MANUAL: MusicCacheTier = 'manual';

export function normalizeMusicCacheTier(raw: unknown): MusicCacheTier {
  return raw === 'manual' ? 'manual' : 'auto';
}

/** 写入时：manual 优先，已有 manual 不被 auto 覆盖 */
export function mergeMusicCacheTier(
  existing: MusicCacheTier | undefined | null,
  requested: MusicCacheTier,
): MusicCacheTier {
  if (requested === 'manual' || existing === 'manual') return 'manual';
  return 'auto';
}
