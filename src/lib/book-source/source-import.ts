/**
 * 书源导入解析
 * 兼容 legado 书源 JSON 格式（bookSourceUrl、bookSourceName 等）与当前项目的 sourceUrl、sourceName
 */

import type { NewBookSource } from '@/types';

/** legado 风格的单条书源（可能带 bookSource 前缀的字段） */
interface LegadoSourceItem {
  bookSourceUrl?: string;
  bookSourceName?: string;
  bookSourceGroup?: string;
  bookSourceType?: number;
  bookSourceComment?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourceGroup?: string;
  sourceType?: number;
  sourceComment?: string;
  [key: string]: unknown;
}

/**
 * 将单条书源项（legado 或本项目格式）规范为 NewBookSource
 */
function normalizeSourceItem(raw: LegadoSourceItem): NewBookSource | null {
  const sourceUrl = raw.sourceUrl ?? raw.bookSourceUrl;
  const sourceName = raw.sourceName ?? raw.bookSourceName;
  if (!sourceUrl || typeof sourceUrl !== 'string' || !sourceName || typeof sourceName !== 'string') {
    return null;
  }
  const out = {
    sourceUrl: String(sourceUrl).trim(),
    sourceName: String(sourceName).trim(),
    sourceGroup: raw.sourceGroup ?? raw.bookSourceGroup,
    sourceType: raw.sourceType ?? raw.bookSourceType,
    sourceComment: raw.sourceComment ?? raw.bookSourceComment,
    enabled: raw.enabled,
    enableExplore: raw.enableExplore,
    bookUrlPattern: raw.bookUrlPattern,
    customOrder: raw.customOrder,
    lastUpdateTime: raw.lastUpdateTime,
    respondTime: raw.respondTime,
    weight: raw.weight,
    searchUrl: raw.searchUrl,
    exploreUrl: raw.exploreUrl,
    exploreScreen: raw.exploreScreen,
    ruleSearch: raw.ruleSearch,
    ruleExplore: raw.ruleExplore,
    ruleBookInfo: raw.ruleBookInfo,
    ruleToc: raw.ruleToc,
    ruleContent: raw.ruleContent,
    ruleReview: raw.ruleReview,
    header: raw.header,
    jsLib: raw.jsLib,
    loginUrl: raw.loginUrl != null ? String(raw.loginUrl) : undefined,
    loginUi: raw.loginUi != null ? String(raw.loginUi) : undefined,
    loginCheckJs: raw.loginCheckJs,
    coverDecodeJs: raw.coverDecodeJs,
    variableComment: raw.variableComment,
    concurrentRate: raw.concurrentRate,
    enabledCookieJar: raw.enabledCookieJar,
  };
  return out as NewBookSource;
}

/**
 * 解析书源 JSON 字符串（支持单条对象或数组，兼容 legado 字段名）
 * @returns 规范后的书源列表，无效项已过滤
 */
export function parseBookSourceJson(jsonText: string): NewBookSource[] {
  const trimmed = jsonText.trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items: LegadoSourceItem[] = Array.isArray(data) ? data : [data as LegadoSourceItem];
  const result: NewBookSource[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const normalized = normalizeSourceItem(item as LegadoSourceItem);
      if (normalized) result.push(normalized);
    }
  }
  return result;
}
