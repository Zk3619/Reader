/**
 * 全局弹幕观感 / 过滤 / OP·ED（点播与番剧共用）
 * key：reader.video.danmakuPrefs.v1
 * 自 reader.tv.playPrefs.v1 + bangumi 样式字段迁移
 */

const STORAGE_KEY = 'reader.video.danmakuPrefs.v1';
const LEGACY_TV_KEY = 'reader.tv.playPrefs.v1';
const MIGRATED_FLAG = 'reader.video.danmakuPrefs.migrated.v1';

/** 全屏弹幕密度（对齐 B 站：默认允许同行多条 + 行微错位） */
export type DanmakuDensity = 'less' | 'normal' | 'more' | 'overlap';

/** 与 artplayer-plugin-danmuku 内置 MARGIN.steps 对齐，避免面板显示「未知」 */
export type ArtDanmakuMargin = [number | `${number}%`, number | `${number}%`];

export const DANMAKU_AREA_STEPS = [
  { area: 0.25, label: '1/4', margin: [10, '75%'] as ArtDanmakuMargin },
  { area: 0.5, label: '半屏', margin: [10, '50%'] as ArtDanmakuMargin },
  { area: 0.75, label: '3/4', margin: [10, '25%'] as ArtDanmakuMargin },
  { area: 1, label: '满屏', margin: [10, 10] as ArtDanmakuMargin },
] as const;

/**
 * 弹幕速度五档（Artplayer `speed` = 屏上停留秒数，越大越慢）。
 * 相对官方默认整体降两档：原「极慢」10 → 现「适中」。
 */
export const DANMAKU_SPEED_STEPS = [
  { name: '极慢', value: 15 },
  { name: '较慢', value: 12.5, hide: true as const },
  { name: '适中', value: 10 },
  { name: '较快', value: 7.5, hide: true as const },
  { name: '极快', value: 5 },
] as const;

export type DanmakuSpeedValue = (typeof DANMAKU_SPEED_STEPS)[number]['value'];

/** 插件 option.SPEED，与面板滑块档位严格一致 */
export const ARTPLAYER_DANMAKU_SPEED_OPTION = {
  min: 0,
  max: 4,
  steps: DANMAKU_SPEED_STEPS.map((s) => {
    const step: { name: string; value: number; hide?: boolean } = {
      name: s.name,
      value: s.value,
    };
    if ('hide' in s && s.hide) step.hide = true;
    return step;
  }),
};

export type DanmakuPrefs = {
  /** 是否加载弹幕 */
  danmakuEnabled: boolean;
  /** 0–1 */
  danmakuOpacity: number;
  /** 字号，约 12–48 */
  danmakuFontSize: number;
  /** Artplayer speed：屏上停留秒数（越大越慢），须落在 DANMAKU_SPEED_STEPS */
  danmakuSpeed: number;
  /** 单条展示时长（秒）；与 speed 近似同步 */
  danmakuDuration: number;
  /** 弹幕占用画面比例 0–1 → 映射到插件 MARGIN 四档 */
  danmakuArea: number;
  /** 行高倍率（无独立 API 时近似放大字号） */
  danmakuLineHeight: number;
  /** 随播放倍速同步弹幕速度（synchronousPlayback） */
  danmakuFollowSpeed: boolean;
  /** 字号随播放器高度缩放（fontSize 用百分比） */
  danmakuScaleWithScreen: boolean;
  /** 底部 15% 不推送弹幕，避免挡字幕 */
  danmakuAvoidSubtitle: boolean;
  danmakuTop: boolean;
  danmakuBottom: boolean;
  danmakuScroll: boolean;
  /**
   * @deprecated 已移除海量模式；读入时迁移到 density，写出恒为 false
   */
  danmakuMassive: boolean;
  /**
   * 仅满屏区域生效：较少/正常/较多均防重叠（水平复用行）；重叠=优先空轨，无空轨时叠轨+微偏。
   * 非满屏始终按 normal 行为。
   */
  danmakuDensity: DanmakuDensity;
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
  danmakuSpeed: 10,
  danmakuDuration: 10,
  danmakuArea: 1,
  danmakuLineHeight: 1.6,
  danmakuFollowSpeed: true,
  danmakuScaleWithScreen: false,
  danmakuAvoidSubtitle: false,
  danmakuTop: true,
  danmakuBottom: false,
  danmakuScroll: true,
  danmakuMassive: false,
  danmakuDensity: 'normal',
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

const DENSITY_V2_FLAG = 'reader.video.danmakuDensity.v2';

function migrateDensityV2(raw: unknown, massive: boolean): DanmakuDensity | null {
  // 一次性：旧 normal(防重叠)→less；海量/dense→overlap；未设置→新默认
  try {
    if (localStorage.getItem(DENSITY_V2_FLAG) === '1') return null;
    localStorage.setItem(DENSITY_V2_FLAG, '1');
  } catch {
    /* 无 storage 时仍按旧值映射一次 */
  }
  if (raw === 'less' || raw === 'more' || raw === 'overlap') return raw;
  if (raw === 'dense') return 'overlap';
  if (raw === 'normal') return 'less';
  if (massive) return 'overlap';
  return DEFAULTS.danmakuDensity;
}

function asDensity(v: unknown, fallback: DanmakuDensity): DanmakuDensity {
  if (v === 'less' || v === 'normal' || v === 'more' || v === 'overlap') return v;
  if (v === 'dense') return 'overlap';
  return fallback;
}

/** 弹幕区域是否视为满屏（显示密度选项） */
export function isDanmakuFullArea(area: number): boolean {
  return nearestDanmakuAreaStep(area).area >= 1;
}

/** 将任意 area 吸附到插件四档，避免 margin 无法匹配步骤名 */
export function nearestDanmakuAreaStep(area: number): (typeof DANMAKU_AREA_STEPS)[number] {
  const a = clamp(Number(area), 0, 1);
  let best = DANMAKU_AREA_STEPS[DANMAKU_AREA_STEPS.length - 1]!;
  let bestDist = Infinity;
  for (const step of DANMAKU_AREA_STEPS) {
    const d = Math.abs(step.area - a);
    if (d < bestDist) {
      bestDist = d;
      best = step;
    }
  }
  return best;
}

export function areaToArtplayerMargin(area: number): ArtDanmakuMargin {
  return nearestDanmakuAreaStep(area).margin;
}

/** Kazumi duration(秒) → Artplayer speed（吸附五档） */
export function durationToArtplayerSpeed(durationSec: number): number {
  return nearestDanmakuSpeedStep(durationSec).value;
}

/** Artplayer speed → 近似 duration（speed 即停留秒数） */
export function artplayerSpeedToDuration(speed: number): number {
  return nearestDanmakuSpeedStep(speed).value;
}

/** 将任意 speed 吸附到五档，避免面板「未知」 */
export function nearestDanmakuSpeedStep(speed: number): {
  name: string;
  value: number;
  hide?: boolean;
} {
  const s = Number(speed);
  const target = Number.isFinite(s) ? s : DEFAULTS.danmakuSpeed;
  let best: (typeof DANMAKU_SPEED_STEPS)[number] = DANMAKU_SPEED_STEPS[2]!;
  let bestDist = Infinity;
  for (const step of DANMAKU_SPEED_STEPS) {
    const d = Math.abs(step.value - target);
    if (d < bestDist) {
      bestDist = d;
      best = step;
    }
  }
  return best;
}

const SPEED_SHIFT_V1_FLAG = 'reader.video.danmakuSpeed.shift2.v1';

/** 一次性：全体降两档（+5 停留秒 ≈ 官方两档），再吸附到新五档 */
function migrateSpeedShiftV1(raw: unknown): number | null {
  try {
    if (localStorage.getItem(SPEED_SHIFT_V1_FLAG) === '1') return null;
    localStorage.setItem(SPEED_SHIFT_V1_FLAG, '1');
  } catch {
    /* */
  }
  const s = Number(raw);
  if (!Number.isFinite(s)) return DEFAULTS.danmakuSpeed;
  return nearestDanmakuSpeedStep(s + 5).value;
}

function normalize(p: Partial<DanmakuPrefs>): DanmakuPrefs {
  const migratedSpeed = migrateSpeedShiftV1(p.danmakuSpeed);
  let speed =
    migratedSpeed ??
    nearestDanmakuSpeedStep(
      Number(p.danmakuSpeed ?? DEFAULTS.danmakuSpeed),
    ).value;
  let duration = nearestDanmakuSpeedStep(
    Number(p.danmakuDuration ?? speed),
  ).value;
  // 若只带了 duration（来自 bangumi），用其推导 speed
  if (p.danmakuDuration != null && p.danmakuSpeed == null && migratedSpeed == null) {
    speed = durationToArtplayerSpeed(Number(p.danmakuDuration));
    duration = artplayerSpeedToDuration(speed);
  } else if (migratedSpeed != null) {
    duration = artplayerSpeedToDuration(speed);
  } else if (p.danmakuSpeed != null && p.danmakuDuration == null) {
    duration = artplayerSpeedToDuration(speed);
  }
  const massive = asBool(p.danmakuMassive, false);
  const migrated = migrateDensityV2(p.danmakuDensity, massive);
  const density = migrated ?? asDensity(p.danmakuDensity, DEFAULTS.danmakuDensity);
  const areaStep = nearestDanmakuAreaStep(
    Number(p.danmakuArea ?? DEFAULTS.danmakuArea),
  );
  return {
    danmakuEnabled: asBool(p.danmakuEnabled, DEFAULTS.danmakuEnabled),
    danmakuOpacity: clamp(Number(p.danmakuOpacity ?? DEFAULTS.danmakuOpacity), 0.1, 1),
    danmakuFontSize: clamp(Number(p.danmakuFontSize ?? DEFAULTS.danmakuFontSize), 10, 48),
    danmakuSpeed: speed,
    danmakuDuration: duration,
    danmakuArea: areaStep.area,
    danmakuLineHeight: clamp(Number(p.danmakuLineHeight ?? DEFAULTS.danmakuLineHeight), 0, 3),
    danmakuFollowSpeed: asBool(p.danmakuFollowSpeed, DEFAULTS.danmakuFollowSpeed),
    danmakuScaleWithScreen: asBool(
      p.danmakuScaleWithScreen,
      DEFAULTS.danmakuScaleWithScreen,
    ),
    danmakuAvoidSubtitle: asBool(
      p.danmakuAvoidSubtitle,
      DEFAULTS.danmakuAvoidSubtitle,
    ),
    danmakuTop: asBool(p.danmakuTop, DEFAULTS.danmakuTop),
    danmakuBottom: asBool(p.danmakuBottom, DEFAULTS.danmakuBottom),
    danmakuScroll: asBool(p.danmakuScroll, DEFAULTS.danmakuScroll),
    danmakuMassive: false,
    danmakuDensity: density,
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
  const synced: Partial<DanmakuPrefs> = { ...patch };
  // 旧海量开关 → density；新代码不再写出 massive=true
  if (patch.danmakuMassive != null && patch.danmakuDensity == null) {
    synced.danmakuDensity = patch.danmakuMassive ? 'overlap' : 'less';
  }
  synced.danmakuMassive = false;
  if (typeof patch.danmakuArea === 'number') {
    synced.danmakuArea = nearestDanmakuAreaStep(patch.danmakuArea).area;
  }
  if (typeof patch.danmakuSpeed === 'number') {
    synced.danmakuSpeed = nearestDanmakuSpeedStep(patch.danmakuSpeed).value;
  }
  const next = normalize({
    ...cur,
    ...synced,
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
  if (typeof patch.danmakuEnabled === 'boolean') {
    void Promise.all([
      import('@/lib/media/tv/play/player-bridge'),
      import('@/lib/media/video/danmaku/art-danmuku'),
      import('@/lib/media/video/danmaku/send'),
    ]).then(([bridge, danmu, send]) => {
      const art = bridge.getTvPlayer();
      if (!art) return;
      const show = send.shouldShowDanmakuEmitter();
      danmu.setArtDanmukuEmitter(art, show);
      try {
        const stage = (
          art.template as { $player?: HTMLElement }
        ).$player?.closest('.reader-artplayer-stage');
        stage?.classList.toggle('reader-art-danmaku-send', show);
      } catch {
        /* */
      }
    });
  }
  if (
    patch.danmakuDensity != null ||
    patch.danmakuArea != null ||
    patch.danmakuOpacity != null ||
    patch.danmakuFontSize != null ||
    patch.danmakuSpeed != null ||
    patch.danmakuLineHeight != null ||
    patch.danmakuTop != null ||
    patch.danmakuBottom != null ||
    patch.danmakuScroll != null ||
    patch.danmakuFollowSpeed != null ||
    patch.danmakuScaleWithScreen != null ||
    patch.danmakuAvoidSubtitle != null
  ) {
    void Promise.all([
      import('@/lib/media/tv/play/player-bridge'),
      import('@/lib/media/video/danmaku/art-danmuku'),
    ]).then(([bridge, danmu]) => {
      danmu.applyArtDanmakuVisualPrefs(bridge.getTvPlayer());
    });
  }
  return { ...next };
}

/**
 * 生效中的密度：非满屏始终 normal。
 */
export function resolveEffectiveDanmakuDensity(
  prefs: DanmakuPrefs = getDanmakuPrefs(),
): DanmakuDensity {
  if (!isDanmakuFullArea(prefs.danmakuArea)) return 'normal';
  return prefs.danmakuDensity;
}

/**
 * 防重叠：较少/正常/较多均开启（水平空隙足够时可复用行）。
 * 仅「重叠」关闭：仍优先空轨；无空轨时才叠轨并轻微上下偏移。
 */
export function resolveDanmakuAntiOverlap(prefs: DanmakuPrefs = getDanmakuPrefs()): boolean {
  return resolveEffectiveDanmakuDensity(prefs) !== 'overlap';
}

/** @deprecated 调度已交回插件原生；保留空实现以免外部引用报错 */
export function resolveDanmakuEmitPerTick(_prefs?: DanmakuPrefs): number {
  return 0;
}

/**
 * 同行间距：较多/重叠略加快滚动（缩短 restTime），不写入 option.speed，避免面板「未知」。
 */
export function resolveDanmakuSpeedFactor(prefs: DanmakuPrefs = getDanmakuPrefs()): number {
  const d = resolveEffectiveDanmakuDensity(prefs);
  if (d === 'overlap') return 1.18;
  if (d === 'more') return 1.08;
  return 1;
}

/** 密度档位文案（设置页 / 播放器面板共用） */
export const DANMAKU_DENSITY_OPTIONS: Array<{
  value: DanmakuDensity;
  label: string;
}> = [
  { value: 'less', label: '较少' },
  { value: 'normal', label: '正常' },
  { value: 'more', label: '较多' },
  { value: 'overlap', label: '重叠' },
];

/** 设置页速度五档 */
export const DANMAKU_SPEED_OPTIONS: Array<{ value: string; label: string }> =
  DANMAKU_SPEED_STEPS.map((s) => ({
    value: String(s.value),
    label: s.name,
  }));

export function marginToDanmakuArea(margin: unknown): number | null {
  if (!Array.isArray(margin) || margin.length < 2) return null;
  const a = margin[0];
  const b = margin[1];
  for (const step of DANMAKU_AREA_STEPS) {
    if (step.margin[0] === a && step.margin[1] === b) return step.area;
  }
  return null;
}

/** Artplayer 插件可用的 margin / modes / antiOverlap 等（对齐官方选项） */
export function resolveArtplayerFontSize(
  prefs: DanmakuPrefs = getDanmakuPrefs(),
): number | `${number}%` {
  const px = Math.round(
    prefs.danmakuFontSize * Math.max(0.8, Math.min(1.4, prefs.danmakuLineHeight / 1.6)),
  );
  if (!prefs.danmakuScaleWithScreen) return px;
  // 以 720p 为基准：同偏好字号在不同高度下等比缩放
  const pct = Math.round((px / 720) * 10000) / 100;
  return `${Math.max(1.5, Math.min(15, pct))}%`;
}

/** Artplayer 插件可用的 margin / modes / antiOverlap 等（对齐官方选项） */
export function danmakuPrefsToArtplayerOpts(prefs: DanmakuPrefs = getDanmakuPrefs()): {
  opacity: number;
  fontSize: number | `${number}%`;
  speed: number;
  antiOverlap: boolean;
  margin: ArtDanmakuMargin;
  modes: Array<0 | 1 | 2>;
  synchronousPlayback: boolean;
} {
  const modes: Array<0 | 1 | 2> = [];
  if (prefs.danmakuScroll) modes.push(0);
  if (prefs.danmakuTop) modes.push(1);
  if (prefs.danmakuBottom) modes.push(2);
  if (!modes.length) modes.push(0);
  // 必须精确等于 SPEED.steps[].value，否则面板显示「未知」
  const speed = nearestDanmakuSpeedStep(prefs.danmakuSpeed).value;
  return {
    opacity: prefs.danmakuOpacity,
    fontSize: resolveArtplayerFontSize(prefs),
    speed,
    antiOverlap: resolveDanmakuAntiOverlap(prefs),
    margin: areaToArtplayerMargin(prefs.danmakuArea),
    modes,
    synchronousPlayback: prefs.danmakuFollowSpeed,
  };
}

/** font-weight 1–9 → CSS */
export function danmakuFontWeightCss(weight: number): number {
  return clamp(Math.round(weight) * 100, 100, 900);
}
