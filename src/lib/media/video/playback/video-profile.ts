/**
 * 视频构建配置：默认 Artplayer-only（轻量）；增强需 VITE_VIDEO_PROFILE=enhanced。
 * 由 `scripts/with-video-profile.mjs` / pnpm `*:enhanced` / `*:libmpv` 注入。
 *
 * lite：Artplayer + 外置播放器；不暴露内嵌 libmpv / Media3 / Anime4K·RIFE 入口。
 * enhanced：完整 Playback Kernel（含 libmpv 等）。
 */

let testOverride: boolean | null = null;

/**
 * 是否为 Artplayer-only 轻量配置（不暴露内嵌 libmpv / Media3 / Anime4K·RIFE）。
 * 外置播放器在 lite 仍可用。未设置或 `artplayer-only` → true；仅 `enhanced` → false。
 */
export function isArtplayerOnlyProfile(): boolean {
  if (testOverride != null) return testOverride;
  return import.meta.env.VITE_VIDEO_PROFILE !== 'enhanced';
}

/** 增强构建：暴露 libmpv / Media3 / Anime4K·RIFE 等 */
export function isEnhancedVideoProfile(): boolean {
  return !isArtplayerOnlyProfile();
}

/** @internal 单测注入；传 null 恢复读环境变量 */
export function setArtplayerOnlyProfileForTest(value: boolean | null): void {
  testOverride = value;
}
