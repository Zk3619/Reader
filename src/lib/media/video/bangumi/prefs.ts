/**
 * 番剧模块偏好：规则订阅、抽流、弹幕（对齐 Kazumi）、界面
 * 持久化 → video_bangumi_prefs + video_bangumi_rule_subs
 */

import { BANGUMI_PREF_KEYS, setBangumiPrefJson } from '@/lib/media/video/bangumi/db/prefs-dao';
import {
  removeBangumiRuleSub,
  replaceAllBangumiRuleSubs,
  upsertBangumiRuleSub,
} from '@/lib/media/video/bangumi/db/subs-dao';
import {
  getCachedModulePrefs,
  isBangumiSqliteHydrated,
  setCachedModulePrefs,
} from '@/lib/media/video/bangumi/db/migrate-ls';
import { getDanmakuPrefs, setDanmakuPrefs } from '@/lib/media/video/danmaku/danmaku-prefs';
import { getArtplayerPlaySettings, setArtplayerPlaySettings } from '@/lib/media/video/artplayer/play-settings-prefs';
import { DEFAULT_SOURCE_ORDER, getDanmuApiPrefs, setDanmuApiPrefs } from '@/lib/media/video/danmaku/danmu-api/prefs';

export const BANGUMI_RULE_API_LEVEL = 8;

export type BangumiResolveMode = 'auto' | 'static' | 'webview';

/** 分类控件：对齐影视首页 tabs / stacked；menu=仅更多下拉 */
export type BangumiTagControl = 'tabs' | 'stacked' | 'menu';

/** 徽标堆叠芯片密度（对齐音乐/影视） */
export type BangumiTagStackDensity = 'comfortable' | 'compact';

/** 选源页规则展示：标签堆叠 / 分页 Tabs / 下拉 */
export type BangumiSourceControl = 'stacked' | 'tabs' | 'menu';

export type BangumiTimelineSort = 'heat' | 'score' | 'id';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** 弹幕样式子集（对齐 Kazumi danmaku_settings，不含全局主题） */
export type BangumiDanmakuStylePrefs = {
  danmakuEnabledByDefault: boolean;
  danmakuSourceBilibili: boolean;
  danmakuSourceGamer: boolean;
  danmakuSourceDandan: boolean;
  danmakuArea: number;
  danmakuDuration: number;
  danmakuLineHeight: number;
  danmakuFollowSpeed: boolean;
  danmakuTop: boolean;
  danmakuBottom: boolean;
  danmakuScroll: boolean;
  danmakuMassive: boolean;
  danmakuDeduplication: boolean;
  danmakuBorder: boolean;
  danmakuBorderSize: number;
  danmakuColor: boolean;
  danmakuFontSize: number;
  danmakuFontWeight: number;
  danmakuOpacity: number;
  danmakuTimeOffset: number;
  /** 下载/缓存弹幕（对齐 downloadDanmaku） */
  downloadDanmaku: boolean;
};

export type BangumiModulePrefs = BangumiDanmakuStylePrefs & {
  ruleSubscribeUrls: string[];
  /** 对齐 Kazumi enableGitProxy：官方规则仓库走 GitCode 镜像 */
  useRulesShopMirror: boolean;
  autoUpdateRules: boolean;
  resolveMode: BangumiResolveMode;
  /** 弹幕关键词屏蔽 */
  danmakuBlockKeywords: string[];
  /**
   * @deprecated 改用 danmakuSource* 开关；仍兼容旧数据（小写来源名表示屏蔽）
   */
  danmakuBlockSources: string[];
  /** 本地上屏（自发弹幕） */
  enableDanmakuSendLocal: boolean;
  /** 远端推送（弹弹 / DANMU_PUSH_URL） */
  enableDanmakuSendRemote: boolean;
  tagControl: BangumiTagControl;
  /** 分类徽标堆叠时芯片密度 */
  tagStackDensity: BangumiTagStackDensity;
  /** 选源页源列表展示方式 */
  sourceControl: BangumiSourceControl;
  timelineSort: BangumiTimelineSort;
  timelineHideAbandoned: boolean;
  timelineHideWatched: boolean;
  timelineOnlyWatching: boolean;
  /** 对齐 Kazumi showRating */
  showScoreBadge: boolean;
  /** 对齐 Kazumi showAnimeCounter（收藏页统计，占位） */
  showAnimeCounter: boolean;
  /** 番剧播放：续播 */
  playResume: boolean;
  /** 番剧播放：自动下一集 */
  autoPlayNext: boolean;
};

const DANMAKU_DEFAULTS: BangumiDanmakuStylePrefs = {
  danmakuEnabledByDefault: false,
  danmakuSourceBilibili: true,
  danmakuSourceGamer: true,
  danmakuSourceDandan: true,
  danmakuArea: 1,
  danmakuDuration: 8,
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
  danmakuFontSize: 25,
  danmakuFontWeight: 4,
  danmakuOpacity: 1,
  danmakuTimeOffset: 0,
  downloadDanmaku: true,
};

const DEFAULTS: BangumiModulePrefs = {
  ...DANMAKU_DEFAULTS,
  ruleSubscribeUrls: [],
  useRulesShopMirror: false,
  autoUpdateRules: false,
  resolveMode: 'auto',
  danmakuBlockKeywords: [],
  danmakuBlockSources: [],
  enableDanmakuSendLocal: false,
  enableDanmakuSendRemote: false,
  tagControl: 'tabs',
  tagStackDensity: 'comfortable',
  sourceControl: 'stacked',
  timelineSort: 'heat',
  timelineHideAbandoned: false,
  timelineHideWatched: false,
  timelineOnlyWatching: false,
  showScoreBadge: true,
  showAnimeCounter: false,
  playResume: true,
  autoPlayNext: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === true) return true;
  if (v === false) return false;
  return fallback;
}

function migrateSourcesFromLegacy(
  p: Partial<BangumiModulePrefs>,
): Pick<
  BangumiModulePrefs,
  'danmakuSourceBilibili' | 'danmakuSourceGamer' | 'danmakuSourceDandan'
> {
  const blocked = new Set(
    (Array.isArray(p.danmakuBlockSources) ? p.danmakuBlockSources : []).map((s) =>
      String(s).toLowerCase(),
    ),
  );
  const bili =
    p.danmakuSourceBilibili !== undefined
      ? p.danmakuSourceBilibili === true
      : !blocked.has('bili') && !blocked.has('bilibili');
  const gamer =
    p.danmakuSourceGamer !== undefined
      ? p.danmakuSourceGamer === true
      : !blocked.has('gamer') && !blocked.has('bahamut');
  const dandan =
    p.danmakuSourceDandan !== undefined
      ? p.danmakuSourceDandan === true
      : !blocked.has('dandan') && !blocked.has('dandanplay');
  return {
    danmakuSourceBilibili: bili,
    danmakuSourceGamer: gamer,
    danmakuSourceDandan: dandan,
  };
}

export function normalizeModulePrefs(p: Partial<BangumiModulePrefs> = {}): BangumiModulePrefs {
  const sources = migrateSourcesFromLegacy(p);
  return {
    ...DEFAULTS,
    ...p,
    ...sources,
    ruleSubscribeUrls: Array.isArray(p.ruleSubscribeUrls)
      ? p.ruleSubscribeUrls
          .filter((u): u is string => typeof u === 'string')
          .map((u) => u.trim())
          .filter(Boolean)
      : [],
    useRulesShopMirror: p.useRulesShopMirror === true,
    danmakuBlockKeywords: Array.isArray(p.danmakuBlockKeywords)
      ? p.danmakuBlockKeywords.filter((u): u is string => typeof u === 'string')
      : [],
    danmakuBlockSources: Array.isArray(p.danmakuBlockSources)
      ? p.danmakuBlockSources.filter((u): u is string => typeof u === 'string')
      : [],
    resolveMode:
      p.resolveMode === 'static' || p.resolveMode === 'webview' || p.resolveMode === 'auto'
        ? p.resolveMode
        : 'auto',
    autoUpdateRules: p.autoUpdateRules === true,
    // 兼容旧字段 enableDanmakuSend → 同时迁移到本地/远程
    ...(() => {
      const legacy = (p as { enableDanmakuSend?: boolean }).enableDanmakuSend === true;
      return {
        enableDanmakuSendLocal:
          typeof p.enableDanmakuSendLocal === 'boolean'
            ? p.enableDanmakuSendLocal
            : legacy,
        enableDanmakuSendRemote:
          typeof p.enableDanmakuSendRemote === 'boolean'
            ? p.enableDanmakuSendRemote
            : legacy,
      };
    })(),
    tagControl:
      p.tagControl === 'stacked' || p.tagControl === 'menu' || p.tagControl === 'tabs'
        ? p.tagControl
        : 'tabs',
    tagStackDensity: p.tagStackDensity === 'compact' ? 'compact' : 'comfortable',
    sourceControl:
      p.sourceControl === 'tabs' || p.sourceControl === 'menu' || p.sourceControl === 'stacked'
        ? p.sourceControl
        : 'stacked',
    timelineSort:
      p.timelineSort === 'score' || p.timelineSort === 'id' || p.timelineSort === 'heat'
        ? p.timelineSort
        : 'heat',
    timelineHideAbandoned: p.timelineHideAbandoned === true,
    timelineHideWatched: p.timelineHideWatched === true,
    timelineOnlyWatching: p.timelineOnlyWatching === true,
    showScoreBadge: p.showScoreBadge !== false,
    showAnimeCounter: p.showAnimeCounter === true,
    playResume: p.playResume !== false,
    autoPlayNext: p.autoPlayNext !== false,
    danmakuEnabledByDefault: asBool(p.danmakuEnabledByDefault, DEFAULTS.danmakuEnabledByDefault),
    danmakuArea: clamp(Number(p.danmakuArea ?? DEFAULTS.danmakuArea), 0, 1),
    danmakuDuration: clamp(Number(p.danmakuDuration ?? DEFAULTS.danmakuDuration), 2, 16),
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
    danmakuFontSize: clamp(Number(p.danmakuFontSize ?? DEFAULTS.danmakuFontSize), 10, 48),
    danmakuFontWeight: clamp(Number(p.danmakuFontWeight ?? DEFAULTS.danmakuFontWeight), 1, 9),
    danmakuOpacity: clamp(Number(p.danmakuOpacity ?? DEFAULTS.danmakuOpacity), 0.1, 1),
    danmakuTimeOffset: clamp(Number(p.danmakuTimeOffset ?? DEFAULTS.danmakuTimeOffset), -180, 180),
    downloadDanmaku: asBool(p.downloadDanmaku, DEFAULTS.downloadDanmaku),
  };
}

function persistModulePrefs(next: BangumiModulePrefs): void {
  setCachedModulePrefs(next);
  const { ruleSubscribeUrls, ...rest } = next;
  void setBangumiPrefJson(BANGUMI_PREF_KEYS.module, rest).catch((e) =>
    console.warn('[bangumi] save module prefs failed', e),
  );
  void replaceAllBangumiRuleSubs(ruleSubscribeUrls).catch((e) =>
    console.warn('[bangumi] save rule subs failed', e),
  );
}

/** hydrate 完成前暂存的 patch，避免用 DEFAULTS 冲库 */
let pendingModulePatch: Partial<BangumiModulePrefs> | null = null;
let pendingFlushScheduled = false;

function scheduleFlushPendingModulePatch(): void {
  if (pendingFlushScheduled) return;
  pendingFlushScheduled = true;
  void import('@/lib/media/video/bangumi/db/migrate-ls')
    .then(async (m) => {
      await m.ensureBangumiSqliteMigrated();
      pendingFlushScheduled = false;
      const patch = pendingModulePatch;
      pendingModulePatch = null;
      if (patch) {
        const next = normalizeModulePrefs({ ...getBangumiModulePrefs(), ...patch });
        persistModulePrefs(next);
      }
    })
    .catch((e) => {
      pendingFlushScheduled = false;
      console.warn('[bangumi] flush pending module prefs failed', e);
    });
}

export function getBangumiModulePrefs(): BangumiModulePrefs {
  const base = normalizeModulePrefs(getCachedModulePrefs() ?? DEFAULTS);
  const withPending = pendingModulePatch
    ? normalizeModulePrefs({ ...base, ...pendingModulePatch })
    : base;
  // 样式以全局 danmakuPrefs 为准（UI 读 bangumi 字段时仍一致）
  const d = getDanmakuPrefs();
  const order = new Set(
    getDanmuApiPrefs()
      .sourceOrder.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return {
    ...withPending,
    danmakuEnabledByDefault: d.danmakuEnabled,
    danmakuOpacity: d.danmakuOpacity,
    danmakuFontSize: d.danmakuFontSize,
    danmakuDuration: d.danmakuDuration,
    danmakuArea: d.danmakuArea,
    danmakuLineHeight: d.danmakuLineHeight,
    danmakuFollowSpeed: d.danmakuFollowSpeed,
    danmakuTop: d.danmakuTop,
    danmakuBottom: d.danmakuBottom,
    danmakuScroll: d.danmakuScroll,
    danmakuMassive: d.danmakuMassive,
    danmakuDeduplication: d.danmakuDeduplication,
    danmakuBorder: d.danmakuBorder,
    danmakuBorderSize: d.danmakuBorderSize,
    danmakuColor: d.danmakuColor,
    danmakuFontWeight: d.danmakuFontWeight,
    danmakuTimeOffset: d.danmakuTimeOffset,
    danmakuBlockKeywords: d.danmakuBlockKeywords,
    downloadDanmaku: d.downloadDanmaku,
    playResume: d.playResume,
    autoPlayNext: getArtplayerPlaySettings().playMode === 'autoNext',
    danmakuSourceBilibili: order.has('bilibili'),
    danmakuSourceGamer: order.has('bahamut'),
    danmakuSourceDandan: order.has('dandan'),
  };
}

export function setBangumiModulePrefs(patch: Partial<BangumiModulePrefs>): BangumiModulePrefs {
  syncStylePatchToGlobal(patch);
  if (!isBangumiSqliteHydrated()) {
    pendingModulePatch = { ...(pendingModulePatch ?? {}), ...patch };
    scheduleFlushPendingModulePatch();
    syncDanmakuSendToPlayer(patch);
    return getBangumiModulePrefs();
  }
  const next = normalizeModulePrefs({ ...getBangumiModulePrefs(), ...patch });
  persistModulePrefs(next);
  syncDanmakuSendToPlayer(patch);
  return next;
}

export function setBangumiDanmakuEnabledByDefaultSilent(enabled: boolean): void {
  setDanmakuPrefs({ danmakuEnabled: enabled });
  if (!isBangumiSqliteHydrated()) {
    pendingModulePatch = {
      ...(pendingModulePatch ?? {}),
      danmakuEnabledByDefault: enabled,
    };
    scheduleFlushPendingModulePatch();
    return;
  }
  const next = normalizeModulePrefs({
    ...getBangumiModulePrefs(),
    danmakuEnabledByDefault: enabled,
  });
  persistModulePrefs(next);
}

/** 恢复弹幕相关默认（写全局 danmakuPrefs；保留关键词与发送开关） */
export function resetBangumiDanmakuPrefs(): BangumiModulePrefs {
  const cur = getBangumiModulePrefs();
  setDanmakuPrefs({
    danmakuEnabled: DANMAKU_DEFAULTS.danmakuEnabledByDefault,
    danmakuOpacity: DANMAKU_DEFAULTS.danmakuOpacity,
    danmakuFontSize: DANMAKU_DEFAULTS.danmakuFontSize,
    danmakuDuration: DANMAKU_DEFAULTS.danmakuDuration,
    danmakuArea: DANMAKU_DEFAULTS.danmakuArea,
    danmakuLineHeight: DANMAKU_DEFAULTS.danmakuLineHeight,
    danmakuFollowSpeed: DANMAKU_DEFAULTS.danmakuFollowSpeed,
    danmakuTop: DANMAKU_DEFAULTS.danmakuTop,
    danmakuBottom: DANMAKU_DEFAULTS.danmakuBottom,
    danmakuScroll: DANMAKU_DEFAULTS.danmakuScroll,
    danmakuMassive: false,
    danmakuDensity: 'normal',
    danmakuAntiOverlap: true,
    danmakuDeduplication: DANMAKU_DEFAULTS.danmakuDeduplication,
    danmakuBorder: DANMAKU_DEFAULTS.danmakuBorder,
    danmakuBorderSize: DANMAKU_DEFAULTS.danmakuBorderSize,
    danmakuColor: DANMAKU_DEFAULTS.danmakuColor,
    danmakuFontWeight: DANMAKU_DEFAULTS.danmakuFontWeight,
    danmakuTimeOffset: DANMAKU_DEFAULTS.danmakuTimeOffset,
    downloadDanmaku: DANMAKU_DEFAULTS.downloadDanmaku,
    playResume: true,
    danmakuBlockKeywords: cur.danmakuBlockKeywords,
  });
  return setBangumiModulePrefs({
    enableDanmakuSendLocal: cur.enableDanmakuSendLocal,
    enableDanmakuSendRemote: cur.enableDanmakuSendRemote,
  });
}

function syncStylePatchToGlobal(patch: Partial<BangumiModulePrefs>): void {
  const styleKeys = [
    'danmakuEnabledByDefault',
    'danmakuOpacity',
    'danmakuFontSize',
    'danmakuDuration',
    'danmakuArea',
    'danmakuLineHeight',
    'danmakuFollowSpeed',
    'danmakuTop',
    'danmakuBottom',
    'danmakuScroll',
    'danmakuMassive',
    'danmakuDeduplication',
    'danmakuBorder',
    'danmakuBorderSize',
    'danmakuColor',
    'danmakuFontWeight',
    'danmakuTimeOffset',
    'danmakuBlockKeywords',
    'downloadDanmaku',
    'playResume',
  ] as const;
  const hasStyle = styleKeys.some((k) => k in patch);
  if (hasStyle) {
    const p: Parameters<typeof setDanmakuPrefs>[0] = {};
    if (typeof patch.danmakuEnabledByDefault === 'boolean') {
      p.danmakuEnabled = patch.danmakuEnabledByDefault;
    }
    if (typeof patch.danmakuOpacity === 'number') p.danmakuOpacity = patch.danmakuOpacity;
    if (typeof patch.danmakuFontSize === 'number') p.danmakuFontSize = patch.danmakuFontSize;
    if (typeof patch.danmakuDuration === 'number') p.danmakuDuration = patch.danmakuDuration;
    if (typeof patch.danmakuArea === 'number') p.danmakuArea = patch.danmakuArea;
    if (typeof patch.danmakuLineHeight === 'number') p.danmakuLineHeight = patch.danmakuLineHeight;
    if (typeof patch.danmakuFollowSpeed === 'boolean') {
      p.danmakuFollowSpeed = patch.danmakuFollowSpeed;
    }
    if (typeof patch.danmakuTop === 'boolean') p.danmakuTop = patch.danmakuTop;
    if (typeof patch.danmakuBottom === 'boolean') p.danmakuBottom = patch.danmakuBottom;
    if (typeof patch.danmakuScroll === 'boolean') p.danmakuScroll = patch.danmakuScroll;
    if (typeof patch.danmakuMassive === 'boolean') {
      p.danmakuMassive = false;
      p.danmakuDensity = patch.danmakuMassive ? 'more' : 'less';
      p.danmakuAntiOverlap = !patch.danmakuMassive;
    }
    if (typeof patch.danmakuDeduplication === 'boolean') {
      p.danmakuDeduplication = patch.danmakuDeduplication;
    }
    if (typeof patch.danmakuBorder === 'boolean') p.danmakuBorder = patch.danmakuBorder;
    if (typeof patch.danmakuBorderSize === 'number') p.danmakuBorderSize = patch.danmakuBorderSize;
    if (typeof patch.danmakuColor === 'boolean') p.danmakuColor = patch.danmakuColor;
    if (typeof patch.danmakuFontWeight === 'number') p.danmakuFontWeight = patch.danmakuFontWeight;
    if (typeof patch.danmakuTimeOffset === 'number') p.danmakuTimeOffset = patch.danmakuTimeOffset;
    if (Array.isArray(patch.danmakuBlockKeywords)) {
      p.danmakuBlockKeywords = patch.danmakuBlockKeywords;
    }
    if (typeof patch.downloadDanmaku === 'boolean') p.downloadDanmaku = patch.downloadDanmaku;
    if (typeof patch.playResume === 'boolean') p.playResume = patch.playResume;
    setDanmakuPrefs(p);
  }
  if (typeof patch.autoPlayNext === 'boolean') {
    setArtplayerPlaySettings({
      playMode: patch.autoPlayNext ? 'autoNext' : 'pause',
    });
  }
  if (
    typeof patch.danmakuSourceBilibili === 'boolean' ||
    typeof patch.danmakuSourceGamer === 'boolean' ||
    typeof patch.danmakuSourceDandan === 'boolean'
  ) {
    const prefs = getDanmuApiPrefs();
    let parts = prefs.sourceOrder
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const toggle = (id: string, on: boolean | undefined) => {
      if (on === undefined) return;
      parts = parts.filter((s) => s !== id);
      if (on) parts.push(id);
    };
    toggle('bilibili', patch.danmakuSourceBilibili);
    toggle('bahamut', patch.danmakuSourceGamer);
    toggle('dandan', patch.danmakuSourceDandan);
    const order = DEFAULT_SOURCE_ORDER.split(',');
    parts.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    setDanmuApiPrefs({ sourceOrder: parts.join(',') });
  }
}

/** 设置页改本地/远程发送时，立刻刷新当前播放器发送框 */
function syncDanmakuSendToPlayer(patch: Partial<BangumiModulePrefs>): void {
  if (
    typeof patch.enableDanmakuSendLocal !== 'boolean' &&
    typeof patch.enableDanmakuSendRemote !== 'boolean'
  ) {
    return;
  }
  void Promise.all([
    import('@/lib/media/tv/play/player-bridge'),
    import('@/lib/media/video/danmaku/art-danmuku'),
    import('@/lib/media/video/danmaku/send'),
  ]).then(([bridge, danmu, send]) => {
    const art = bridge.getTvPlayer();
    if (!art) return;
    const showEmitter = send.shouldShowDanmakuEmitter();
    danmu.setArtDanmukuEmitter(art, showEmitter);
    try {
      const stage = (
        art.template as { $player?: HTMLElement }
      ).$player?.closest('.reader-artplayer-stage');
      stage?.classList.toggle('reader-art-danmaku-send', showEmitter);
    } catch {
      /* */
    }
  });
}

export function addBangumiRuleSubscribeUrl(url: string): void {
  const u = url.trim();
  if (!u) return;
  const apply = () => {
    const s = getBangumiModulePrefs();
    if (s.ruleSubscribeUrls.includes(u)) return;
    const next = normalizeModulePrefs({
      ...s,
      ruleSubscribeUrls: [...s.ruleSubscribeUrls, u],
    });
    setCachedModulePrefs(next);
    void upsertBangumiRuleSub(u).catch((e) => console.warn('[bangumi] add sub failed', e));
    const { ruleSubscribeUrls: _u, ...rest } = next;
    void setBangumiPrefJson(BANGUMI_PREF_KEYS.module, rest).catch(() => undefined);
  };
  if (!isBangumiSqliteHydrated()) {
    void import('@/lib/media/video/bangumi/db/migrate-ls')
      .then((m) => m.ensureBangumiSqliteMigrated())
      .then(apply)
      .catch((e) => console.warn('[bangumi] add sub after hydrate failed', e));
    return;
  }
  apply();
}

export function removeBangumiRuleSubscribeUrl(url: string): void {
  const apply = () => {
    const s = getBangumiModulePrefs();
    const next = normalizeModulePrefs({
      ...s,
      ruleSubscribeUrls: s.ruleSubscribeUrls.filter((x) => x !== url),
    });
    setCachedModulePrefs(next);
    void removeBangumiRuleSub(url).catch((e) => console.warn('[bangumi] remove sub failed', e));
  };
  if (!isBangumiSqliteHydrated()) {
    void import('@/lib/media/video/bangumi/db/migrate-ls')
      .then((m) => m.ensureBangumiSqliteMigrated())
      .then(apply)
      .catch((e) => console.warn('[bangumi] remove sub after hydrate failed', e));
    return;
  }
  apply();
}
