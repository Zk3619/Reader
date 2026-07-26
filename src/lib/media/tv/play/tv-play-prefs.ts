/**
 * 影视播放偏好 — 薄封装，权威源为全局 danmaku-prefs
 * @deprecated 请直接使用 getDanmakuPrefs / setDanmakuPrefs
 */

import {
  getDanmakuPrefs,
  setDanmakuPrefs,
  type DanmakuPrefs,
} from '@/lib/media/video/danmaku/danmaku-prefs';

/** @deprecated 使用 DanmakuPrefs */
export type TvPlayPrefs = Pick<
  DanmakuPrefs,
  | 'danmakuEnabled'
  | 'danmakuOpacity'
  | 'danmakuFontSize'
  | 'danmakuSpeed'
  | 'openingSkipSec'
  | 'endingSkipSec'
  | 'libmpvDanmakuAutoAttach'
  | 'libmpvDanmakuFontSize'
  | 'libmpvDanmakuOpacity'
  | 'libmpvDanmakuDuration'
  | 'libmpvDanmakuMergeSec'
  | 'libmpvDanmakuMax'
  | 'androidSkipMode'
  | 'androidDanmakuMode'
>;

function toTv(p: DanmakuPrefs): TvPlayPrefs {
  return {
    danmakuEnabled: p.danmakuEnabled,
    danmakuOpacity: p.danmakuOpacity,
    danmakuFontSize: p.danmakuFontSize,
    danmakuSpeed: p.danmakuSpeed,
    openingSkipSec: p.openingSkipSec,
    endingSkipSec: p.endingSkipSec,
    libmpvDanmakuAutoAttach: p.libmpvDanmakuAutoAttach,
    libmpvDanmakuFontSize: p.libmpvDanmakuFontSize,
    libmpvDanmakuOpacity: p.libmpvDanmakuOpacity,
    libmpvDanmakuDuration: p.libmpvDanmakuDuration,
    libmpvDanmakuMergeSec: p.libmpvDanmakuMergeSec,
    libmpvDanmakuMax: p.libmpvDanmakuMax,
    androidSkipMode: p.androidSkipMode,
    androidDanmakuMode: p.androidDanmakuMode,
  };
}

export function getTvPlayPrefs(): TvPlayPrefs {
  return toTv(getDanmakuPrefs());
}

export function setTvPlayPrefs(patch: Partial<TvPlayPrefs>): TvPlayPrefs {
  return toTv(setDanmakuPrefs(patch));
}

/** @deprecated 与 setTvPlayPrefs 相同（已无双向 bangumi 回写） */
export function setTvPlayPrefsSilent(patch: Partial<TvPlayPrefs>): TvPlayPrefs {
  return toTv(setDanmakuPrefs(patch));
}
