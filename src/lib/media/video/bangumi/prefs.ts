/**
 * 番剧模块偏好：规则订阅、抽流、弹幕过滤
 */

export const BANGUMI_RULE_API_LEVEL = 8;

const KEY = 'reader.bangumi.prefs.v1';

export type BangumiResolveMode = 'auto' | 'static' | 'webview';

export type BangumiModulePrefs = {
  ruleSubscribeUrls: string[];
  autoUpdateRules: boolean;
  resolveMode: BangumiResolveMode;
  /** 弹幕关键词屏蔽（逗号/换行分隔存为数组） */
  danmakuBlockKeywords: string[];
  /** 屏蔽来源标记：bili / gamer / dandan 等 */
  danmakuBlockSources: string[];
  enableDanmakuSend: boolean;
};

const DEFAULTS: BangumiModulePrefs = {
  ruleSubscribeUrls: [],
  autoUpdateRules: false,
  resolveMode: 'auto',
  danmakuBlockKeywords: [],
  danmakuBlockSources: [],
  enableDanmakuSend: false,
};

export function getBangumiModulePrefs(): BangumiModulePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<BangumiModulePrefs>;
    return {
      ...DEFAULTS,
      ...p,
      ruleSubscribeUrls: Array.isArray(p.ruleSubscribeUrls)
        ? p.ruleSubscribeUrls.filter((u): u is string => typeof u === 'string' && !!u.trim())
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setBangumiModulePrefs(patch: Partial<BangumiModulePrefs>): BangumiModulePrefs {
  const next = { ...getBangumiModulePrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function addBangumiRuleSubscribeUrl(url: string): void {
  const u = url.trim();
  if (!u) return;
  const s = getBangumiModulePrefs();
  if (s.ruleSubscribeUrls.includes(u)) return;
  setBangumiModulePrefs({ ruleSubscribeUrls: [...s.ruleSubscribeUrls, u] });
}

export function removeBangumiRuleSubscribeUrl(url: string): void {
  const s = getBangumiModulePrefs();
  setBangumiModulePrefs({
    ruleSubscribeUrls: s.ruleSubscribeUrls.filter((x) => x !== url),
  });
}
