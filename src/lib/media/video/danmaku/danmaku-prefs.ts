/**
 * 全局弹幕观感 / 过滤 / OP·ED（点播与番剧共用）
 * key：reader.video.danmakuPrefs.v1
 * 自 reader.tv.playPrefs.v1 + bangumi 样式字段迁移
 */

const STORAGE_KEY = 'reader.video.danmakuPrefs.v1';
const LEGACY_TV_KEY = 'reader.tv.playPrefs.v1';
const MIGRATED_FLAG = 'reader.video.danmakuPrefs.migrated.v1';

export type DanmakuPrefs = {
  /** 是否加载弹幕 */
  danmakuEnabled: boolean;
  /** 0–1 */
  danmakuOpacity: number;
  /** 字号，约 12–48 */
  danmakuFontSize: number;
  /** Artplayer 滚动 speed（越大越快） */
  danmakuSpeed: number;
  /** 单条展示时长（秒）；与 speed 双向近似映射 */
  danmakuDuration: number;
  /** 弹幕占用画面比例 0–1 → margin */
  danmakuArea: number;
  /** 行高倍率（无独立 API 时近似放大字号） */
  danmakuLineHeight: number;
  /** 随播放倍速微调弹幕速度 */
  danmakuFollowSpeed: boolean;
  danmakuTop: boolean;
  danmakuBottom: boolean;
  danmakuScroll: boolean;
  /** 海量模式：关闭防重叠 */
  danmakuMassive: boolean;
  danmakuDeduplication: boolean;
  danmakuBorder: boolean;
  danmakuBorderSize: number;
  /** false 时强制白色 */
  danmakuColor: boolean;
  /** 1–9 → CSS font-weight */
  danmakuFontWeight: number;
  /** 时间轴偏移（秒） */
  danmakuTimeOffset: number;
  danmakuBlockKeywords: string[];
  /** 下载/缓存弹幕 */
  downloadDanmaku: boolean;
  /** 续播进度（Artplayer autoPlayback） */
  playResume: boolean;
  openingSkipSec: number;
  endingSkipSec: number;
  libmpvDanmakuAutoAttach: boolean;
  libmpvDanmakuFontSize: number;
  libmpvDanmakuOpacity: number;
  libmpvDanmakuDuration: number;
  libmpvDanmakuMergeSec: number;
  libmpvDanmakuMax: number;
  androidSkipMode: 'fixed' | 'chapter';
  androidDanmakuMode: 'overlay' | 'ass' | 'off';
};

const DEFAULTS: DanmakuPrefs = {
  danmakuEnabled: false,
  danmakuOpacity: 0.92,
  danmakuFontSize: 25,
  danmakuSpeed: 5,
  danmakuDuration: 8,
  danmakuArea: 1,
  danmakuLineHeight: 1.6,
  danmakuFollowSpeed: true,
  danmakuTop: true,
  danmakuBottom: false,
  danmakuScroll: true,
  danmakuMassive: false,
  danmakuDeduplication: false,
  danmakuBorder: true,
  danmakuBorderSize: 1.5,
  danmakuColor: true,
  danmakuFontWeight: 4,
  danmakuTimeOffset: 0,
  danmakuBlockKeywords: [],
  downloadDanmaku: true,
  playResume: true,
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

let cache: DanmakuPrefs | null = null;
let migrated = false;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === true) return true;
  if (v === false) return false;
  return fallback;
}

/** Kazumi duration(秒) → Artplayer speed */
export function durationToArtplayerSpeed(durationSec: number): number {
  const d = Math.max(2, Math.min(16, durationSec));
  return Math.max(1, Math.min(20, Math.round((40 / d) * 10) / 10));
}

/** Artplayer speed → 近似 duration */
export function artplayerSpeedToDuration(speed: number): number {
  const s = Math.max(1, Math.min(20, speed));
  return Math.max(2, Math.min(16, Math.round((40 / s) * 10) / 10));
}

function normalize(p: Partial<DanmakuPrefs>): DanmakuPrefs {
  const duration = clamp(Number(p.danmakuDuration ?? DEFAULTS.danmakuDuration), 2, 16);
  let speed = clamp(Number(p.danmakuSpeed ?? DEFAULTS.danmakuSpeed), 1, 20);
  // 若只带了 duration（来自 bangumi），用其推导 speed
  if (p.danmakuDuration != null && p.danmakuSpeed == null) {
    speed = durationToArtplayerSpeed(duration);
  }
  return {
    danmakuEnabled: asBool(p.danmakuEnabled, DEFAULTS.danmakuEnabled),
    danmakuOpacity: clamp(Number(p.danmakuOpacity ?? DEFAULTS.danmakuOpacity), 0.1, 1),
    danmakuFontSize: clamp(Number(p.danmakuFontSize ?? DEFAULTS.danmakuFontSize), 10, 48),
    danmakuSpeed: speed,
    danmakuDuration: duration,
    danmakuArea: clamp(Number(p.danmakuArea ?? DEFAULTS.danmakuArea), 0, 1),
    danmakuLineHeight: clamp(Number(p.danmakuLineHeight ?? DEFAULTS.danmakuLineHeight), 0, 3),
    danmakuFollowSpeed: asBool(p.danmakuFollowSpeed, DEFAULTS.danmakuFollowSpeed),
    danmakuTop: asBool(p.danmakuTop, DEFAULTS.danmakuTop),
    danmakuBottom: asBool(p.danmakuBottom, DEFAULTS.danmakuBottom),
    danmakuScroll: asBool(p.danmakuScroll, DEFAULTS.danmakuScroll),
    danmakuMassive: asBool(p.danmakuMassive, DEFAULTS.danmakuMassive),
    danmakuDeduplication: asBool(p.danmakuDeduplication, DEFAULTS.danmakuDeduplication),
    danmakuBorder: asBool(p.danmakuBorder, DEFAULTS.danmakuBorder),
    danmakuBorderSize: clamp(Number(p.danmakuBorderSize ?? DEFAULTS.danmakuBorderSize), 0.1, 3),
    danmakuColor: asBool(p.danmakuColor, DEFAULTS.danmakuColor),
    danmakuFontWeight: clamp(Number(p.danmakuFontWeight ?? DEFAULTS.danmakuFontWeight), 1, 9),
    danmakuTimeOffset: clamp(Number(p.danmakuTimeOffset ?? DEFAULTS.danmakuTimeOffset), -180, 180),
    danmakuBlockKeywords: Array.isArray(p.danmakuBlockKeywords)
      ? p.danmakuBlockKeywords.filter((u): u is string => typeof u === 'string')
      : [],
    downloadDanmaku: asBool(p.downloadDanmaku, DEFAULTS.downloadDanmaku),
    playResume: asBool(p.playResume, DEFAULTS.playResume),
    openingSkipSec: clamp(Number(p.openingSkipSec ?? DEFAULTS.openingSkipSec), 0, 600),
    endingSkipSec: clamp(Number(p.endingSkipSec ?? DEFAULTS.endingSkipSec), 0, 600),
    libmpvDanmakuAutoAttach: asBool(
      p.libmpvDanmakuAutoAttach,
      DEFAULTS.libmpvDanmakuAutoAttach,
    ),
    libmpvDanmakuFontSize: clamp(
      Number(p.libmpvDanmakuFontSize ?? DEFAULTS.libmpvDanmakuFontSize),
      16,
      96,
    ),
    libmpvDanmakuOpacity: clamp(
      Number(p.libmpvDanmakuOpacity ?? DEFAULTS.libmpvDanmakuOpacity),
      0,
      100,
    ),
    libmpvDanmakuDuration: clamp(
      Number(p.libmpvDanmakuDuration ?? DEFAULTS.libmpvDanmakuDuration),
      2,
      30,
    ),
    libmpvDanmakuMergeSec: clamp(
      Number(p.libmpvDanmakuMergeSec ?? DEFAULTS.libmpvDanmakuMergeSec),
      0,
      30,
    ),
    libmpvDanmakuMax: clamp(Number(p.libmpvDanmakuMax ?? DEFAULTS.libmpvDanmakuMax), 100, 20000),
    androidSkipMode: p.androidSkipMode === 'chapter' ? 'chapter' : 'fixed',
    androidDanmakuMode:
      p.androidDanmakuMode === 'ass' || p.androidDanmakuMode === 'off'
        ? p.androidDanmakuMode
        : 'overlay',
  };
}

function readLegacyTv(): Partial<DanmakuPrefs> {
  try {
    const raw = localStorage.getItem(LEGACY_TV_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<DanmakuPrefs>;
  } catch {
    return {};
  }
}

function readLegacyBangumiStyle(): Partial<DanmakuPrefs> & {
  danmakuEnabledByDefault?: boolean;
  autoPlayNext?: boolean;
  danmakuSourceBilibili?: boolean;
  danmakuSourceGamer?: boolean;
  danmakuSourceDandan?: boolean;
} {
  try {
    // bangumi 可能尚未 hydrate；尽量读 LS 镜像（migrate-ls 写入前可能为空）
    const raw = localStorage.getItem('reader.bangumi.prefs.v1');
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      danmakuEnabledByDefault: j.danmakuEnabledByDefault === true,
      danmakuOpacity: typeof j.danmakuOpacity === 'number' ? j.danmakuOpacity : undefined,
      danmakuFontSize: typeof j.danmakuFontSize === 'number' ? j.danmakuFontSize : undefined,
      danmakuDuration: typeof j.danmakuDuration === 'number' ? j.danmakuDuration : undefined,
      danmakuArea: typeof j.danmakuArea === 'number' ? j.danmakuArea : undefined,
      danmakuLineHeight: typeof j.danmakuLineHeight === 'number' ? j.danmakuLineHeight : undefined,
      danmakuFollowSpeed: typeof j.danmakuFollowSpeed === 'boolean' ? j.danmakuFollowSpeed : undefined,
      danmakuTop: typeof j.danmakuTop === 'boolean' ? j.danmakuTop : undefined,
      danmakuBottom: typeof j.danmakuBottom === 'boolean' ? j.danmakuBottom : undefined,
      danmakuScroll: typeof j.danmakuScroll === 'boolean' ? j.danmakuScroll : undefined,
      danmakuMassive: typeof j.danmakuMassive === 'boolean' ? j.danmakuMassive : undefined,
      danmakuDeduplication:
        typeof j.danmakuDeduplication === 'boolean' ? j.danmakuDeduplication : undefined,
      danmakuBorder: typeof j.danmakuBorder === 'boolean' ? j.danmakuBorder : undefined,
      danmakuBorderSize: typeof j.danmakuBorderSize === 'number' ? j.danmakuBorderSize : undefined,
      danmakuColor: typeof j.danmakuColor === 'boolean' ? j.danmakuColor : undefined,
      danmakuFontWeight: typeof j.danmakuFontWeight === 'number' ? j.danmakuFontWeight : undefined,
      danmakuTimeOffset: typeof j.danmakuTimeOffset === 'number' ? j.danmakuTimeOffset : undefined,
      danmakuBlockKeywords: Array.isArray(j.danmakuBlockKeywords)
        ? (j.danmakuBlockKeywords as string[])
        : undefined,
      downloadDanmaku: typeof j.downloadDanmaku === 'boolean' ? j.downloadDanmaku : undefined,
      playResume: typeof j.playResume === 'boolean' ? j.playResume : undefined,
      autoPlayNext: typeof j.autoPlayNext === 'boolean' ? j.autoPlayNext : undefined,
      danmakuSourceBilibili:
        typeof j.danmakuSourceBilibili === 'boolean' ? j.danmakuSourceBilibili : undefined,
      danmakuSourceGamer:
        typeof j.danmakuSourceGamer === 'boolean' ? j.danmakuSourceGamer : undefined,
      danmakuSourceDandan:
        typeof j.danmakuSourceDandan === 'boolean' ? j.danmakuSourceDandan : undefined,
    };
  } catch {
    return {};
  }
}

/** 将旧三源开关合并进 danmu_api sourceOrder（关闭的源从列表移除） */
function migrateSourceTogglesToDanmuApi(legacy: {
  danmakuSourceBilibili?: boolean;
  danmakuSourceGamer?: boolean;
  danmakuSourceDandan?: boolean;
}): void {
  const remove: string[] = [];
  if (legacy.danmakuSourceBilibili === false) remove.push('bilibili');
  if (legacy.danmakuSourceGamer === false) remove.push('bahamut');
  if (legacy.danmakuSourceDandan === false) remove.push('dandan');
  if (!remove.length) return;
  void import('@/lib/media/video/danmaku/danmu-api/prefs').then((m) => {
    const prefs = m.getDanmuApiPrefs();
    const parts = prefs.sourceOrder
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !remove.includes(s));
    m.setDanmuApiPrefs({ sourceOrder: parts.join(',') });
  });
}

function migrateOnce(): void {
  if (migrated) return;
  migrated = true;
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return;
    if (localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }
  } catch {
    /* */
  }

  const tv = readLegacyTv();
  const bg = readLegacyBangumiStyle();

  // bangumi 观感优先于 TV；enabled 取 OR
  const merged: Partial<DanmakuPrefs> = {
    ...DEFAULTS,
    ...tv,
    ...(bg.danmakuOpacity != null ? { danmakuOpacity: bg.danmakuOpacity } : {}),
    ...(bg.danmakuFontSize != null ? { danmakuFontSize: bg.danmakuFontSize } : {}),
    ...(bg.danmakuDuration != null ? { danmakuDuration: bg.danmakuDuration } : {}),
    ...(bg.danmakuArea != null ? { danmakuArea: bg.danmakuArea } : {}),
    ...(bg.danmakuLineHeight != null ? { danmakuLineHeight: bg.danmakuLineHeight } : {}),
    ...(bg.danmakuFollowSpeed != null ? { danmakuFollowSpeed: bg.danmakuFollowSpeed } : {}),
    ...(bg.danmakuTop != null ? { danmakuTop: bg.danmakuTop } : {}),
    ...(bg.danmakuBottom != null ? { danmakuBottom: bg.danmakuBottom } : {}),
    ...(bg.danmakuScroll != null ? { danmakuScroll: bg.danmakuScroll } : {}),
    ...(bg.danmakuMassive != null ? { danmakuMassive: bg.danmakuMassive } : {}),
    ...(bg.danmakuDeduplication != null ? { danmakuDeduplication: bg.danmakuDeduplication } : {}),
    ...(bg.danmakuBorder != null ? { danmakuBorder: bg.danmakuBorder } : {}),
    ...(bg.danmakuBorderSize != null ? { danmakuBorderSize: bg.danmakuBorderSize } : {}),
    ...(bg.danmakuColor != null ? { danmakuColor: bg.danmakuColor } : {}),
    ...(bg.danmakuFontWeight != null ? { danmakuFontWeight: bg.danmakuFontWeight } : {}),
    ...(bg.danmakuTimeOffset != null ? { danmakuTimeOffset: bg.danmakuTimeOffset } : {}),
    ...(bg.danmakuBlockKeywords ? { danmakuBlockKeywords: bg.danmakuBlockKeywords } : {}),
    ...(bg.downloadDanmaku != null ? { downloadDanmaku: bg.downloadDanmaku } : {}),
    ...(bg.playResume != null ? { playResume: bg.playResume } : {}),
    danmakuEnabled:
      tv.danmakuEnabled === true || bg.danmakuEnabledByDefault === true
        ? true
        : (tv.danmakuEnabled ?? DEFAULTS.danmakuEnabled),
  };

  if (bg.danmakuDuration != null) {
    merged.danmakuSpeed = durationToArtplayerSpeed(bg.danmakuDuration);
    merged.libmpvDanmakuDuration = bg.danmakuDuration;
    merged.libmpvDanmakuFontSize = Math.round((bg.danmakuFontSize ?? 25) * 1.8);
    merged.libmpvDanmakuOpacity = Math.round((bg.danmakuOpacity ?? 1) * 100);
    if (bg.danmakuDeduplication) {
      merged.libmpvDanmakuMergeSec = Math.max(1, Number(tv.libmpvDanmakuMergeSec) || 1);
    }
  }

  const next = normalize(merged);
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    /* */
  }

  migrateSourceTogglesToDanmuApi(bg);

  // autoPlayNext → artplayer playMode（仅迁移一次）
  if (typeof bg.autoPlayNext === 'boolean') {
    void import('@/lib/media/video/artplayer/play-settings-prefs').then((m) => {
      m.setArtplayerPlaySettings({
        playMode: bg.autoPlayNext ? 'autoNext' : 'pause',
      });
    });
  }
}

function read(): DanmakuPrefs {
  if (cache) return cache;
  migrateOnce();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULTS };
      return cache;
    }
    cache = normalize(JSON.parse(raw) as Partial<DanmakuPrefs>);
    return cache;
  } catch {
    cache = { ...DEFAULTS };
    return cache;
  }
}

export function getDanmakuPrefs(): DanmakuPrefs {
  return { ...read() };
}

export function setDanmakuPrefs(patch: Partial<DanmakuPrefs>): DanmakuPrefs {
  const cur = read();
  const next = normalize({
    ...cur,
    ...patch,
    // 改 duration 时同步 speed；改 speed 时同步 duration（若未显式带另一项）
    ...(typeof patch.danmakuDuration === 'number' && patch.danmakuSpeed == null
      ? { danmakuSpeed: durationToArtplayerSpeed(patch.danmakuDuration) }
      : {}),
    ...(typeof patch.danmakuSpeed === 'number' && patch.danmakuDuration == null
      ? { danmakuDuration: artplayerSpeedToDuration(patch.danmakuSpeed) }
      : {}),
  });
  if (typeof patch.danmakuDeduplication === 'boolean') {
    next.libmpvDanmakuMergeSec = patch.danmakuDeduplication
      ? Math.max(1, next.libmpvDanmakuMergeSec || 1)
      : 0;
  }
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return { ...next };
}

/** Artplayer 插件可用的 margin / modes / antiOverlap 等 */
export function danmakuPrefsToArtplayerOpts(prefs: DanmakuPrefs = getDanmakuPrefs()): {
  opacity: number;
  fontSize: number;
  speed: number;
  antiOverlap: boolean;
  margin: [`${number}%`, `${number}%`];
  modes: Array<0 | 1 | 2>;
} {
  const unused = Math.max(0, Math.min(1, 1 - prefs.danmakuArea));
  const half = Math.round((unused * 50) * 10) / 10;
  const modes: Array<0 | 1 | 2> = [];
  if (prefs.danmakuScroll) modes.push(0);
  if (prefs.danmakuTop) modes.push(1);
  if (prefs.danmakuBottom) modes.push(2);
  if (!modes.length) modes.push(0);
  const fontSize = Math.round(
    prefs.danmakuFontSize * Math.max(0.8, Math.min(1.4, prefs.danmakuLineHeight / 1.6)),
  );
  return {
    opacity: prefs.danmakuOpacity,
    fontSize,
    speed: prefs.danmakuSpeed,
    antiOverlap: !prefs.danmakuMassive,
    margin: [`${half}%`, `${half}%`],
    modes,
  };
}

/** font-weight 1–9 → CSS */
export function danmakuFontWeightCss(weight: number): number {
  return clamp(Math.round(weight) * 100, 100, 900);
}
