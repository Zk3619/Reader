/**
 * 番剧弹幕样式 → 影视播放偏好覆盖（番剧开播时使用）
 */

import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import { getTvPlayPrefs, type TvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';

/** Kazumi duration(秒) → Artplayer speed（经验映射：时长越长速度越慢） */
function durationToArtplayerSpeed(durationSec: number): number {
  const d = Math.max(2, Math.min(16, durationSec));
  // 8s → ~5；2s → ~12；16s → ~2.5
  return Math.max(1, Math.min(20, Math.round((40 / d) * 10) / 10));
}

/** 番剧播放时合并弹幕观感（对齐 Kazumi danmaku_settings） */
export function getEffectivePlayPrefsForBangumi(): TvPlayPrefs {
  const base = getTvPlayPrefs();
  const b = getBangumiModulePrefs();
  return {
    ...base,
    danmakuEnabled: b.danmakuEnabledByDefault,
    danmakuOpacity: b.danmakuOpacity,
    danmakuFontSize: b.danmakuFontSize,
    danmakuSpeed: durationToArtplayerSpeed(b.danmakuDuration),
    libmpvDanmakuAutoAttach: base.libmpvDanmakuAutoAttach,
    libmpvDanmakuFontSize: Math.round(b.danmakuFontSize * 1.8),
    libmpvDanmakuOpacity: Math.round(b.danmakuOpacity * 100),
    libmpvDanmakuDuration: b.danmakuDuration,
    libmpvDanmakuMergeSec: b.danmakuDeduplication ? Math.max(1, base.libmpvDanmakuMergeSec || 1) : 0,
  };
}
