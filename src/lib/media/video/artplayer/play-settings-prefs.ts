/**
 * Artplayer 全局播放偏好（影视 / 阅读器视频共用）
 * key：reader.artplayer.playSettings.v1
 */

const STORAGE_KEY = 'reader.artplayer.playSettings.v1';

export type ArtplayerAspectRatio = 'default' | '4:3' | '16:9';

/** 播完后：自动续播下一集/章，或停在当前结束 */
export type ArtplayerPlayMode = 'autoNext' | 'pause';

/** @deprecated 旧单选翻转；读取时迁移到 flipHorizontal / flipVertical */
export type ArtplayerFlip = 'normal' | 'horizontal' | 'vertical';

export type ArtplayerPlaySettings = {
  /** 水平翻转（可与垂直同时开） */
  flipHorizontal: boolean;
  /** 垂直翻转（可与水平同时开） */
  flipVertical: boolean;
  /** 单集/单章循环 */
  loop: boolean;
  /** 自动开播 */
  autoplay: boolean;
  /** 播放方式：自动续播 / 播完暂停 */
  playMode: ArtplayerPlayMode;
  /** 视频比例 */
  aspectRatio: ArtplayerAspectRatio;
  /** 隐藏黑边（object-fit: cover） */
  hideBlackBars: boolean;
  /** 常规播放倍速（非长按临时倍速） */
  playbackRate: number;
};

const DEFAULTS: ArtplayerPlaySettings = {
  flipHorizontal: false,
  flipVertical: false,
  loop: false,
  autoplay: true,
  playMode: 'autoNext',
  aspectRatio: 'default',
  hideBlackBars: false,
  playbackRate: 1,
};

/** Artplayer 菜单可选倍速 */
export const ARTPLAYER_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

let cache: ArtplayerPlaySettings | null = null;

function coerceAspectRatio(v: unknown): ArtplayerAspectRatio {
  if (v === '4:3' || v === '16:9' || v === 'default') return v;
  return DEFAULTS.aspectRatio;
}

function coercePlayMode(v: unknown): ArtplayerPlayMode {
  if (v === 'autoNext' || v === 'pause') return v;
  return DEFAULTS.playMode;
}

function coercePlaybackRate(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.playbackRate;
  // 允许书级/自定义档，钳到合理范围
  return Math.min(6, Math.max(0.25, Math.round(n * 100) / 100));
}

function migrateFlipAxes(
  j: Partial<ArtplayerPlaySettings> & {
    flip?: ArtplayerFlip;
    mirror?: boolean;
  },
): Pick<ArtplayerPlaySettings, 'flipHorizontal' | 'flipVertical'> {
  if (typeof j.flipHorizontal === 'boolean' || typeof j.flipVertical === 'boolean') {
    return {
      flipHorizontal: j.flipHorizontal === true,
      flipVertical: j.flipVertical === true,
    };
  }
  if (j.flip === 'horizontal') return { flipHorizontal: true, flipVertical: false };
  if (j.flip === 'vertical') return { flipHorizontal: false, flipVertical: true };
  if (j.mirror === true) return { flipHorizontal: true, flipVertical: false };
  return { flipHorizontal: false, flipVertical: false };
}

export function flipAxesTooltip(
  prefs: Pick<ArtplayerPlaySettings, 'flipHorizontal' | 'flipVertical'>,
): string {
  const parts: string[] = [];
  if (prefs.flipHorizontal) parts.push('水平');
  if (prefs.flipVertical) parts.push('垂直');
  return parts.length ? parts.join('+') : '正常';
}

/** 播完是否应自动进入下一集/章（单集循环时由播放器自身 seek，不算 advance） */
export function shouldAutoAdvanceOnEnded(
  prefs: Pick<ArtplayerPlaySettings, 'loop' | 'playMode'> = getArtplayerPlaySettings(),
): boolean {
  if (prefs.loop) return false;
  return prefs.playMode === 'autoNext';
}

function read(): ArtplayerPlaySettings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULTS };
      return cache;
    }
    const j = JSON.parse(raw) as Partial<ArtplayerPlaySettings> & {
      flip?: ArtplayerFlip;
      mirror?: boolean;
    };
    cache = {
      ...migrateFlipAxes(j),
      loop: j.loop === true,
      autoplay: j.autoplay !== false,
      playMode: coercePlayMode(j.playMode),
      aspectRatio: coerceAspectRatio(j.aspectRatio),
      hideBlackBars: j.hideBlackBars === true,
      playbackRate: coercePlaybackRate(j.playbackRate),
    };
    return cache;
  } catch {
    cache = { ...DEFAULTS };
    return cache;
  }
}

export function getArtplayerPlaySettings(): ArtplayerPlaySettings {
  return { ...read() };
}

export function setArtplayerPlaySettings(
  patch: Partial<ArtplayerPlaySettings>,
): ArtplayerPlaySettings {
  const next: ArtplayerPlaySettings = {
    ...read(),
    ...patch,
  };
  next.flipHorizontal = next.flipHorizontal === true;
  next.flipVertical = next.flipVertical === true;
  next.playMode = coercePlayMode(next.playMode);
  next.aspectRatio = coerceAspectRatio(next.aspectRatio);
  next.playbackRate = coercePlaybackRate(next.playbackRate);
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return { ...next };
}
