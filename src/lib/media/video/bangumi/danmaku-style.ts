/**
 * 弹幕样式 → 播放偏好（全局单一源后仅为兼容别名）
 */

import { getDanmakuPrefs } from '@/lib/media/video/danmaku/danmaku-prefs';
import { getTvPlayPrefs, type TvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';

/** @deprecated 使用 getDanmakuPrefs / getTvPlayPrefs */
export function getEffectivePlayPrefsForBangumi(): TvPlayPrefs {
  void getDanmakuPrefs();
  return getTvPlayPrefs();
}
