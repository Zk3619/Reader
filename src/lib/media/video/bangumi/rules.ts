/**
 * 独立番剧规则模型 —— 与 FongMi sites[]/Spider 隔离
 * 兼容 Reader v2 + Kazumi 扩展字段；持久化 → video_bangumi_rules
 * @see docs/VIDEO_BANGUMI_KAZUMI.md
 */

import {
  removeBangumiRuleRow,
  replaceAllBangumiRules,
  upsertBangumiRuleRow,
  getBangumiRulePayloadJson,
} from '@/lib/media/video/bangumi/db/rules-dao';
import {
  ensureBangumiSqliteMigrated,
  getCachedBangumiRules,
  isBangumiSqliteHydrated,
  setCachedBangumiRules,
} from '@/lib/media/video/bangumi/db/migrate-ls';

export type BangumiApiRequestConfig = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  bodyType?: string;
  body?: unknown;
};

export type BangumiApiSearchConfig = {
  request: BangumiApiRequestConfig;
  listPath: string;
  namePath: string;
  sourcePath: string;
};

export type BangumiAntiCrawler = {
  enabled?: boolean;
  captchaDetectXPath?: string;
  clickButtonXPath?: string;
  customJs?: string;
};

export type BangumiRule = {
  id: string;
  name: string;
  /** 站点根 URL */
  baseUrl: string;
  enabled: boolean;
  userAgent?: string;
  referer?: string;
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
  /** Kazumi api level 字符串 */
  kazumiApi?: string;
  searchMode?: 'xpath' | 'api';
  chapterMode?: 'xpath' | 'api';
  useWebview?: boolean;
  adBlocker?: boolean;
  searchApi?: BangumiApiSearchConfig;
  antiCrawler?: BangumiAntiCrawler;
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

const FOLLOW_KEY = 'reader.bangumi.follow.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(raw: Record<string, unknown>, k: string): string | undefined {
  const v = raw[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function normalizeBangumiRule(raw: unknown): BangumiRule | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const baseUrl =
    (typeof raw.baseUrl === 'string' && raw.baseUrl.trim()) ||
    (typeof raw.baseURL === 'string' && raw.baseURL.trim()) ||
    '';
  if (!id || !name || !baseUrl) return null;

  let searchApi: BangumiApiSearchConfig | undefined;
  if (isRecord(raw.searchApi)) {
    const req = isRecord(raw.searchApi.request) ? raw.searchApi.request : {};
    searchApi = {
      request: {
        method: str(req, 'method'),
        url: str(req, 'url'),
        headers: isRecord(req.headers)
          ? Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v ?? '')]))
          : undefined,
        bodyType: str(req, 'bodyType'),
        body: req.body,
      },
      listPath: str(raw.searchApi, 'listPath') || '$.data[*]',
      namePath: str(raw.searchApi, 'namePath') || '$.name',
      sourcePath: str(raw.searchApi, 'sourcePath') || '$.url',
    };
  }

  let antiCrawler: BangumiAntiCrawler | undefined;
  if (isRecord(raw.antiCrawler)) {
    antiCrawler = {
      enabled: raw.antiCrawler.enabled === true,
      captchaDetectXPath: str(raw.antiCrawler, 'captchaDetectXPath'),
      clickButtonXPath: str(raw.antiCrawler, 'clickButtonXPath'),
      customJs: str(raw.antiCrawler, 'customJs'),
    };
  }

  return {
    id,
    name,
    baseUrl,
    enabled: raw.enabled !== false,
    userAgent: str(raw, 'userAgent'),
    referer: str(raw, 'referer'),
    searchPath: str(raw, 'searchPath') || str(raw, 'searchURL'),
    searchList: str(raw, 'searchList'),
    searchName: str(raw, 'searchName'),
    searchCover: str(raw, 'searchCover'),
    searchLink: str(raw, 'searchLink') || str(raw, 'searchResult'),
    chapterList: str(raw, 'chapterList') || str(raw, 'chapterRoads'),
    chapterName: str(raw, 'chapterName'),
    chapterLink: str(raw, 'chapterLink') || str(raw, 'chapterResult'),
    playUrl: str(raw, 'playUrl'),
    kazumiApi: str(raw, 'kazumiApi') || (raw.api != null ? String(raw.api) : undefined),
    searchMode: str(raw, 'searchMode') === 'api' ? 'api' : 'xpath',
    chapterMode: str(raw, 'chapterMode') === 'api' ? 'api' : 'xpath',
    useWebview: raw.useWebview !== false,
    adBlocker: raw.adBlocker === true,
    searchApi,
    antiCrawler,
    version: 2,
  };
}

/** 同步读：依赖 ensureBangumiSqliteMigrated hydrate 后的缓存 */
export function loadBangumiRules(): BangumiRule[] {
  return getCachedBangumiRules().slice();
}

/** hydrate 完成前的整表替换请求；空数组在 hydrate 后若库非空则丢弃，避免误清空 */
let pendingRulesReplace: BangumiRule[] | null = null;
let pendingRulesFlushScheduled = false;

function flushPendingRulesReplace(): void {
  const pending = pendingRulesReplace;
  pendingRulesReplace = null;
  pendingRulesFlushScheduled = false;
  if (pending == null) return;
  const current = getCachedBangumiRules();
  if (pending.length === 0 && current.length > 0) {
    console.warn('[bangumi] skip empty replaceAll after hydrate (would wipe DB rules)');
    return;
  }
  setCachedBangumiRules(pending);
  void replaceAllBangumiRules(pending).catch((e) =>
    console.warn('[bangumi] save rules failed', e),
  );
}

function scheduleFlushPendingRulesReplace(): void {
  if (pendingRulesFlushScheduled) return;
  pendingRulesFlushScheduled = true;
  void ensureBangumiSqliteMigrated()
    .then(() => flushPendingRulesReplace())
    .catch((e) => {
      pendingRulesFlushScheduled = false;
      console.warn('[bangumi] flush pending rules failed', e);
    });
}

export function saveBangumiRules(rules: BangumiRule[]): void {
  const normalized = rules
    .map((r) => normalizeBangumiRule(r))
    .filter((r): r is BangumiRule => r != null);
  if (!isBangumiSqliteHydrated()) {
    pendingRulesReplace = normalized;
    scheduleFlushPendingRulesReplace();
    return;
  }
  setCachedBangumiRules(normalized);
  void replaceAllBangumiRules(normalized).catch((e) =>
    console.warn('[bangumi] save rules failed', e),
  );
}

export function upsertBangumiRule(
  rule: BangumiRule,
  options?: { payload?: unknown },
): BangumiRule[] {
  const next = normalizeBangumiRule({ ...rule, version: 2 });
  if (!next) return loadBangumiRules();
  if (!isBangumiSqliteHydrated()) {
    void ensureBangumiSqliteMigrated()
      .then(() => {
        upsertBangumiRule(next, options);
      })
      .catch((e) => console.warn('[bangumi] deferred upsert failed', e));
    return loadBangumiRules();
  }
  const list = loadBangumiRules().slice();
  const idx = list.findIndex((r) => r.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  setCachedBangumiRules(list);
  void upsertBangumiRuleRow(next, options).catch((e) =>
    console.warn('[bangumi] upsert rule failed', e),
  );
  return list.slice();
}

export function removeBangumiRule(id: string): BangumiRule[] {
  if (!isBangumiSqliteHydrated()) {
    void ensureBangumiSqliteMigrated()
      .then(() => {
        removeBangumiRule(id);
      })
      .catch((e) => console.warn('[bangumi] deferred remove failed', e));
    return loadBangumiRules();
  }
  const list = loadBangumiRules().filter((r) => r.id !== id);
  setCachedBangumiRules(list);
  void removeBangumiRuleRow(id).catch((e) => console.warn('[bangumi] remove rule failed', e));
  return list.slice();
}

/** 按 id 顺序重排规则库 */
export function reorderBangumiRules(idsInOrder: string[]): BangumiRule[] {
  if (!idsInOrder.length) return loadBangumiRules();
  const byId = new Map(loadBangumiRules().map((r) => [r.id, r]));
  const next: BangumiRule[] = [];
  for (const id of idsInOrder) {
    const r = byId.get(id);
    if (r) {
      next.push(r);
      byId.delete(id);
    }
  }
  for (const r of byId.values()) next.push(r);
  saveBangumiRules(next);
  return next.slice();
}

export function setBangumiRuleDisplayName(id: string, name: string): BangumiRule[] {
  const trimmed = name.trim();
  if (!trimmed) return loadBangumiRules();
  const cur = loadBangumiRules().find((r) => r.id === id);
  if (!cur || cur.name === trimmed) return loadBangumiRules();
  return upsertBangumiRule({ ...cur, name: trimmed });
}

export { getBangumiRulePayloadJson };

export function exportRulesJson(rules?: BangumiRule[]): string {
  const payload: BangumiRulesExport = {
    version: 2,
    rules: (rules ?? loadBangumiRules()).map((r) => ({ ...r, version: 2 })),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 导入自有 schema。禁止把 FongMi sites[] 当规则吞入。
 * 若像 Kazumi 插件，调用方应先走 kazumi-adapter。
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
  } else if (isRecord(parsed) && (parsed.baseURL || parsed.baseUrl || parsed.searchURL)) {
    list = [parsed];
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
