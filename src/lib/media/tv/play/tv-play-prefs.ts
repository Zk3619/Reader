/**
 * 影视播放偏好（弹幕 / 片头片尾跳过）
 * 对齐 FongMi 弹幕设置与 OP/ED 跳过的桌面子集
 */

const STORAGE_KEY = 'reader.tv.playPrefs.v1';

export type TvPlayPrefs = {
  /** 是否加载弹幕 */
  danmakuEnabled: boolean;
  /** 0–1 */
  danmakuOpacity: number;
  /** 字号倍率，约 12–36 对应插件 fontSize */
  danmakuFontSize: number;
  /** 滚动速度，插件 speed（越大越快） */
  danmakuSpeed: number;
  /** 片头跳过秒数；0=关闭 */
  openingSkipSec: number;
  /** 片尾剩余秒数内跳下一集；0=关闭 */
  endingSkipSec: number;
  /** 增强窗：匹配后自动 sub-add ASS */
  libmpvDanmakuAutoAttach: boolean;
  /** 增强窗 ASS 字号 */
  libmpvDanmakuFontSize: number;
  /** 增强窗 ASS 不透明度 0–100 */
  libmpvDanmakuOpacity: number;
  /** 增强窗单条展示时长（秒） */
  libmpvDanmakuDuration: number;
  /** 相同文案合并窗口（秒）；0=关 */
  libmpvDanmakuMergeSec: number;
  /** 增强窗最多写入条数 */
  libmpvDanmakuMax: number;
  /** Android OP/ED：fixed=固定秒 · chapter=章节关键词 */
  androidSkipMode: 'fixed' | 'chapter';
  /** Android 弹幕：overlay=FlameMaster · ass=sub-add · off */
  androidDanmakuMode: 'overlay' | 'ass' | 'off';
};

const DEFAULTS: TvPlayPrefs = {
  danmakuEnabled: true,
  danmakuOpacity: 0.92,
  danmakuFontSize: 25,
  danmakuSpeed: 5,
  openingSkipSec: 0,
  endingSkipSec: 0,
  libmpvDanmakuAutoAttach: true,
  libmpvDanmakuFontSize: 48,
  libmpvDanmakuOpacity: 92,
  libmpvDanmakuDuration: 8,
  libmpvDanmakuMergeSec: 1,
  libmpvDanmakuMax: 2000,
  androidSkipMode: 'fixed',
  androidDanmakuMode: 'overlay',
};

let cache: TvPlayPrefs | null = null;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function read(): TvPlayPrefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULTS };
      return cache;
    }
    const j = JSON.parse(raw) as Partial<TvPlayPrefs>;
    cache = {
      danmakuEnabled: j.danmakuEnabled ?? DEFAULTS.danmakuEnabled,
      danmakuOpacity: clamp(Number(j.danmakuOpacity ?? DEFAULTS.danmakuOpacity), 0.1, 1),
      danmakuFontSize: clamp(Number(j.danmakuFontSize ?? DEFAULTS.danmakuFontSize), 12, 48),
      danmakuSpeed: clamp(Number(j.danmakuSpeed ?? DEFAULTS.danmakuSpeed), 1, 20),
      openingSkipSec: clamp(Number(j.openingSkipSec ?? DEFAULTS.openingSkipSec), 0, 600),
      endingSkipSec: clamp(Number(j.endingSkipSec ?? DEFAULTS.endingSkipSec), 0, 600),
      libmpvDanmakuAutoAttach:
        j.libmpvDanmakuAutoAttach ?? DEFAULTS.libmpvDanmakuAutoAttach,
      libmpvDanmakuFontSize: clamp(
        Number(j.libmpvDanmakuFontSize ?? DEFAULTS.libmpvDanmakuFontSize),
        16,
        96,
      ),
      libmpvDanmakuOpacity: clamp(
        Number(j.libmpvDanmakuOpacity ?? DEFAULTS.libmpvDanmakuOpacity),
        0,
        100,
      ),
      libmpvDanmakuDuration: clamp(
        Number(j.libmpvDanmakuDuration ?? DEFAULTS.libmpvDanmakuDuration),
        2,
        30,
      ),
      libmpvDanmakuMergeSec: clamp(
        Number(j.libmpvDanmakuMergeSec ?? DEFAULTS.libmpvDanmakuMergeSec),
        0,
        30,
      ),
      libmpvDanmakuMax: clamp(
        Number(j.libmpvDanmakuMax ?? DEFAULTS.libmpvDanmakuMax),
        100,
        20000,
      ),
      androidSkipMode:
        j.androidSkipMode === 'chapter' ? 'chapter' : DEFAULTS.androidSkipMode,
      androidDanmakuMode:
        j.androidDanmakuMode === 'ass' || j.androidDanmakuMode === 'off'
          ? j.androidDanmakuMode
          : DEFAULTS.androidDanmakuMode,
    };
    return cache;
  } catch {
    cache = { ...DEFAULTS };
    return cache;
  }
}

export function getTvPlayPrefs(): TvPlayPrefs {
  return { ...read() };
}

export function setTvPlayPrefs(patch: Partial<TvPlayPrefs>): TvPlayPrefs {
  const next: TvPlayPrefs = {
    ...read(),
    ...patch,
  };
  next.danmakuOpacity = clamp(next.danmakuOpacity, 0.1, 1);
  next.danmakuFontSize = clamp(next.danmakuFontSize, 12, 48);
  next.danmakuSpeed = clamp(next.danmakuSpeed, 1, 20);
  next.openingSkipSec = clamp(next.openingSkipSec, 0, 600);
  next.endingSkipSec = clamp(next.endingSkipSec, 0, 600);
  next.libmpvDanmakuFontSize = clamp(next.libmpvDanmakuFontSize, 16, 96);
  next.libmpvDanmakuOpacity = clamp(next.libmpvDanmakuOpacity, 0, 100);
  next.libmpvDanmakuDuration = clamp(next.libmpvDanmakuDuration, 2, 30);
  next.libmpvDanmakuMergeSec = clamp(next.libmpvDanmakuMergeSec, 0, 30);
  next.libmpvDanmakuMax = clamp(next.libmpvDanmakuMax, 100, 20000);
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return { ...next };
}
