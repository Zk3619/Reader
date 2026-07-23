/**
 * Kazumi Plugin JSON → Reader BangumiRule
 */

import type { BangumiRule, BangumiApiSearchConfig, BangumiAntiCrawler } from '@/lib/media/video/bangumi/rules';
import { BANGUMI_RULE_API_LEVEL } from '@/lib/media/video/bangumi/prefs';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** @keyword → {keyword}；已是 {keyword} 则保持 */
export function normalizeKeywordPlaceholder(url: string): string {
  return url.replace(/@keyword/gi, '{keyword}');
}

function slugId(name: string, baseUrl: string): string {
  const raw = `${name}_${baseUrl}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `kz_${raw.slice(0, 48)}` || `kz_${Date.now()}`;
}

function parseApiSearch(raw: unknown): BangumiApiSearchConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const req = isRecord(raw.request) ? raw.request : {};
  return {
    request: {
      method: str(req.method) || 'GET',
      url: str(req.url),
      headers: isRecord(req.headers)
        ? Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, String(v ?? '')]),
          )
        : undefined,
      bodyType: str(req.bodyType) || undefined,
      body: req.body,
    },
    listPath: str(raw.listPath) || '$.data[*]',
    namePath: str(raw.namePath) || '$.name',
    sourcePath: str(raw.sourcePath) || '$.url',
  };
}

function parseAnti(raw: unknown): BangumiAntiCrawler | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    enabled: raw.enabled === true,
    captchaDetectXPath: str(raw.captchaDetectXPath) || str(raw.detectXPath) || undefined,
    clickButtonXPath: str(raw.clickButtonXPath) || undefined,
    customJs: str(raw.customJs) || undefined,
  };
}

export type KazumiImportResult = {
  rule: BangumiRule | null;
  skippedReason?: string;
};

export function kazumiPluginToBangumiRule(raw: unknown): KazumiImportResult {
  if (!isRecord(raw)) return { rule: null, skippedReason: '非对象' };
  if (Array.isArray((raw as { sites?: unknown }).sites)) {
    return { rule: null, skippedReason: '禁止 FongMi sites[]' };
  }
  const apiLevel = Number(raw.api ?? 1);
  if (Number.isFinite(apiLevel) && apiLevel > BANGUMI_RULE_API_LEVEL) {
    return {
      rule: null,
      skippedReason: `规则 apiLevel=${apiLevel} 高于客户端 ${BANGUMI_RULE_API_LEVEL}`,
    };
  }
  const name = str(raw.name);
  const baseUrl = str(raw.baseURL || raw.baseUrl);
  if (!name || !baseUrl) return { rule: null, skippedReason: '缺少 name/baseURL' };

  const searchURL = normalizeKeywordPlaceholder(str(raw.searchURL || raw.searchPath));
  const searchMode = str(raw.searchMode) === 'api' ? 'api' : 'xpath';
  const chapterMode = str(raw.chapterMode) === 'api' ? 'api' : 'xpath';

  const rule: BangumiRule = {
    id: str(raw.id) || slugId(name, baseUrl),
    name,
    baseUrl,
    enabled: raw.enabled !== false,
    userAgent: str(raw.userAgent) || undefined,
    referer: str(raw.referer) || undefined,
    searchPath: searchURL || undefined,
    searchList: str(raw.searchList) || undefined,
    searchName: str(raw.searchName) || undefined,
    searchCover: str(raw.searchCover) || undefined,
    searchLink: str(raw.searchResult || raw.searchLink) || undefined,
    chapterList: str(raw.chapterRoads || raw.chapterList) || undefined,
    chapterName: str(raw.chapterName) || undefined,
    chapterLink: str(raw.chapterResult || raw.chapterLink) || undefined,
    playUrl: str(raw.playUrl) || undefined,
    kazumiApi: String(raw.api ?? ''),
    searchMode,
    chapterMode,
    useWebview: raw.useWebview !== false,
    adBlocker: raw.adBlocker === true,
    searchApi: parseApiSearch(raw.searchApiConfig || raw.searchApi),
    antiCrawler: parseAnti(raw.antiCrawlerConfig || raw.antiCrawler),
    version: 2,
  };
  return { rule };
}

/** 单条或数组或 { plugins/rules: [] } */
export function importKazumiRulesJson(text: string): {
  rules: BangumiRule[];
  imported: number;
  skipped: string[];
} {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('空 JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (isRecord(parsed) && Array.isArray(parsed.sites)) {
    throw new Error('禁止导入 FongMi sites[]');
  }
  let list: unknown[] = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (isRecord(parsed)) {
    if (Array.isArray(parsed.rules)) list = parsed.rules;
    else if (Array.isArray(parsed.plugins)) list = parsed.plugins;
    else list = [parsed];
  } else {
    throw new Error('无法识别的规则包');
  }
  const rules: BangumiRule[] = [];
  const skipped: string[] = [];
  for (const item of list) {
    const { rule, skippedReason } = kazumiPluginToBangumiRule(item);
    if (rule) rules.push(rule);
    else if (skippedReason) skipped.push(skippedReason);
  }
  return { rules, imported: rules.length, skipped };
}
