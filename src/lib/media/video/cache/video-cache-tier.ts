/**
 * 影视缓存分级：auto=播放自动写入（可淘汰）；manual=用户显式缓存（仅用户清除）
 */

export type VideoCacheTier = 'auto' | 'manual';

export const VIDEO_CACHE_TIER_AUTO: VideoCacheTier = 'auto';
export const VIDEO_CACHE_TIER_MANUAL: VideoCacheTier = 'manual';

export function normalizeVideoCacheTier(raw: unknown): VideoCacheTier {
  return raw === 'manual' ? 'manual' : 'auto';
}

/** 写入时：manual 优先，已有 manual 不被 auto 覆盖 */
export function mergeVideoCacheTier(
  existing: VideoCacheTier | undefined | null,
  requested: VideoCacheTier,
): VideoCacheTier {
  if (requested === 'manual' || existing === 'manual') return 'manual';
  return 'auto';
}
