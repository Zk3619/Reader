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
  setCachedModulePrefs,
} from '@/lib/media/video/bangumi/db/migrate-ls';

export const BANGUMI_RULE_API_LEVEL = 8;

export type BangumiResolveMode = 'auto' | 'static' | 'webview';

/** 分类控件：对齐影视首页 tabs / stacked；menu=仅更多下拉 */
export type BangumiTagControl = 'tabs' | 'stacked' | 'menu';

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
  autoUpdateRules: boolean;
  resolveMode: BangumiResolveMode;
  /** 弹幕关键词屏蔽 */
  danmakuBlockKeywords: string[];
  /**
   * @deprecated 改用 danmakuSource* 开关；仍兼容旧数据（小写来源名表示屏蔽）
   */
  danmakuBlockSources: string[];
  enableDanmakuSend: boolean;
  tagControl: BangumiTagControl;
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
  autoUpdateRules: false,
  resolveMode: 'auto',
  danmakuBlockKeywords: [],
  danmakuBlockSources: [],
  enableDanmakuSend: false,
  tagControl: 'tabs',
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
    enableDanmakuSend: p.enableDanmakuSend === true,
    tagControl:
      p.tagControl === 'stacked' || p.tagControl === 'menu' || p.tagControl === 'tabs'
        ? p.tagControl
        : 'tabs',
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

export function getBangumiModulePrefs(): BangumiModulePrefs {
  return normalizeModulePrefs(getCachedModulePrefs() ?? DEFAULTS);
}

export function setBangumiModulePrefs(patch: Partial<BangumiModulePrefs>): BangumiModulePrefs {
  const next = normalizeModulePrefs({ ...getBangumiModulePrefs(), ...patch });
  persistModulePrefs(next);
  return next;
}

/** 恢复 Kazumi 弹幕相关默认（保留关键词屏蔽列表） */
export function resetBangumiDanmakuPrefs(): BangumiModulePrefs {
  const cur = getBangumiModulePrefs();
  return setBangumiModulePrefs({
    ...DANMAKU_DEFAULTS,
    danmakuBlockKeywords: cur.danmakuBlockKeywords,
    enableDanmakuSend: cur.enableDanmakuSend,
  });
}

export function addBangumiRuleSubscribeUrl(url: string): void {
  const u = url.trim();
  if (!u) return;
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
}

export function removeBangumiRuleSubscribeUrl(url: string): void {
  const s = getBangumiModulePrefs();
  const next = normalizeModulePrefs({
    ...s,
    ruleSubscribeUrls: s.ruleSubscribeUrls.filter((x) => x !== url),
  });
  setCachedModulePrefs(next);
  void removeBangumiRuleSub(url).catch((e) => console.warn('[bangumi] remove sub failed', e));
}
