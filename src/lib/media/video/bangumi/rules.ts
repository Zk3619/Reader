/**
 * 独立番剧规则模型（E6.1）——与 FongMi sites[]/Spider 隔离
 * 表前缀约定：bangumi_*（实现期落库时遵守）
 * @see docs/VIDEO_BANGUMI_KAZUMI.md §4
 */

export type BangumiRule = {
  id: string;
  name: string;
  /** 站点根 URL */
  baseUrl: string;
  enabled: boolean;
  userAgent?: string;
  /** 搜索：含 {keyword} 占位 */
  searchPath?: string;
  searchList?: string;
  searchName?: string;
  searchCover?: string;
  searchLink?: string;
  /** 详情 / 分集 */
  chapterList?: string;
  chapterName?: string;
  chapterLink?: string;
  /** 播放页取链 */
  playUrl?: string;
  version: 2;
};

/** @deprecated 读 v1 兼容用；写入一律 v2 */
export type BangumiRuleV1 = Omit<BangumiRule, 'version' | 'searchLink' | 'chapterLink'> & {
  version?: 1;
};

export type BangumiFollow = {
  id: string;
  ruleId: string;
  title: string;
  cover?: string;
  url: string;
  updatedAt: number;
};

export type BangumiRulesExport = {
  version: 2;
  rules: BangumiRule[];
};

const RULES_KEY_V2 = 'reader.bangumi.rules.v2';
const RULES_KEY_V1 = 'reader.bangumi.rules.v1';
const FOLLOW_KEY = 'reader.bangumi.follow.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function normalizeBangumiRule(raw: unknown): BangumiRule | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  if (!id || !name || !baseUrl) return null;
  const str = (k: string): string | undefined => {
    const v = raw[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    id,
    name,
    baseUrl,
    enabled: raw.enabled !== false,
    userAgent: str('userAgent'),
    searchPath: str('searchPath'),
    searchList: str('searchList'),
    searchName: str('searchName'),
    searchCover: str('searchCover'),
    searchLink: str('searchLink'),
    chapterList: str('chapterList'),
    chapterName: str('chapterName'),
    chapterLink: str('chapterLink'),
    playUrl: str('playUrl'),
    version: 2,
  };
}

function migrateV1List(raw: unknown): BangumiRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeBangumiRule(item))
    .filter((r): r is BangumiRule => r != null);
}

export function loadBangumiRules(): BangumiRule[] {
  try {
    const v2 = localStorage.getItem(RULES_KEY_V2);
    if (v2) {
      const parsed = JSON.parse(v2) as unknown;
      if (Array.isArray(parsed)) return migrateV1List(parsed);
      if (isRecord(parsed) && Array.isArray(parsed.rules)) {
        return migrateV1List(parsed.rules);
      }
    }
    const v1 = localStorage.getItem(RULES_KEY_V1);
    if (v1) {
      const rules = migrateV1List(JSON.parse(v1));
      if (rules.length) saveBangumiRules(rules);
      return rules;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveBangumiRules(rules: BangumiRule[]): void {
  try {
    const normalized = rules
      .map((r) => normalizeBangumiRule(r))
      .filter((r): r is BangumiRule => r != null);
    localStorage.setItem(RULES_KEY_V2, JSON.stringify(normalized));
  } catch {
    /* */
  }
}

export function upsertBangumiRule(rule: BangumiRule): BangumiRule[] {
  const next = normalizeBangumiRule({ ...rule, version: 2 });
  if (!next) return loadBangumiRules();
  const list = loadBangumiRules().filter((r) => r.id !== next.id);
  list.push(next);
  saveBangumiRules(list);
  return list;
}

export function removeBangumiRule(id: string): BangumiRule[] {
  const list = loadBangumiRules().filter((r) => r.id !== id);
  saveBangumiRules(list);
  return list;
}

export function exportRulesJson(rules?: BangumiRule[]): string {
  const payload: BangumiRulesExport = {
    version: 2,
    rules: (rules ?? loadBangumiRules()).map((r) => ({ ...r, version: 2 })),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 导入自有 schema。禁止把 FongMi sites[] 当规则吞入。
 */
export function importRulesJson(text: string): { rules: BangumiRule[]; imported: number } {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('空 JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (isRecord(parsed) && Array.isArray(parsed.sites)) {
    throw new Error('禁止导入 FongMi sites[]；请使用 Reader bangumi rules 导出包');
  }
  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.rules)) {
    list = parsed.rules;
  } else {
    throw new Error('期望 { version, rules } 或规则数组');
  }
  const existing = loadBangumiRules();
  const byId = new Map(existing.map((r) => [r.id, r]));
  let imported = 0;
  for (const item of list) {
    const n = normalizeBangumiRule(item);
    if (!n) continue;
    byId.set(n.id, n);
    imported += 1;
  }
  const rules = [...byId.values()];
  saveBangumiRules(rules);
  return { rules, imported };
}

export function loadBangumiFollows(): BangumiFollow[] {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBangumiFollows(rows: BangumiFollow[]): void {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(rows));
  } catch {
    /* */
  }
}

export function toggleBangumiFollow(row: Omit<BangumiFollow, 'updatedAt'>): BangumiFollow[] {
  const list = loadBangumiFollows();
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ ...row, updatedAt: Date.now() });
  }
  saveBangumiFollows(list);
  return list;
}

/** 文档约束：禁止把规则写入 FongMi CONFIG sites */
export const BANGUMI_ISOLATION_NOTE =
  'bangumi rules MUST NOT be merged into vod CONFIG sites[] / spider';

/** 结构验收用示例（虚构选择器；非真实站点承诺） */
export const BANGUMI_EXAMPLE_RULE: BangumiRule = {
  id: 'bg_example_demo',
  name: 'Demo Static',
  baseUrl: 'https://example.com',
  enabled: true,
  userAgent: 'Mozilla/5.0 ReaderBangumi/1.0',
  searchPath: '/search?q={keyword}',
  searchList: '.result-item',
  searchName: '.title',
  searchCover: 'img@src',
  searchLink: 'a@href',
  chapterList: '.episode-item',
  chapterName: '.ep-title',
  chapterLink: 'a@href',
  playUrl: 'video@src',
  version: 2,
};
