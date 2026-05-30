/**
 * 书源导入解析
 * 兼容 legado 书源 JSON 格式（bookSourceUrl、bookSourceName 等）与当前项目的 sourceUrl、sourceName
 */

import type { NewBookSource } from '@/types';

/** legado 风格的单条书源（可能带 bookSource 前缀的字段）；允许 GSON 额外字段透传 */
interface LegadoSourceItem {
  [key: string]: unknown;
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
  enabled?: boolean;
  /** Legado JSON 字段名 */
  enabledExplore?: boolean;
  enableExplore?: boolean;
  bookUrlPattern?: string;
  customOrder?: number;
  lastUpdateTime?: number;
  respondTime?: number;
  weight?: number;
  searchUrl?: string;
  exploreUrl?: string;
  exploreScreen?: string;
  ruleSearch?: NewBookSource['ruleSearch'];
  ruleExplore?: NewBookSource['ruleExplore'];
  ruleBookInfo?: NewBookSource['ruleBookInfo'];
  ruleToc?: NewBookSource['ruleToc'];
  ruleContent?: NewBookSource['ruleContent'];
  ruleReview?: unknown;
  header?: string;
  jsLib?: string;
  loginUrl?: string;
  loginUi?: string;
  loginCheckJs?: string;
  coverDecodeJs?: string;
  variableComment?: string;
  concurrentRate?: string;
  enabledCookieJar?: boolean;
  eventListener?: boolean | number;
  customButton?: boolean | number;
  nextPageLazyLoad?: boolean | number;
  nextPagePreload?: boolean | number;
  sourceUrls?: string[];
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '').trim();
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml');
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
  const trimmedUrl = String(sourceUrl).trim();
  const trimmedName = String(sourceName).trim();
  if (!trimmedUrl || !trimmedName) return null;

  const exploreEnabled = raw.enableExplore ?? raw.enabledExplore;
  const cookieJar =
    raw.enabledCookieJar === undefined ? true : Boolean(raw.enabledCookieJar);

  const out: NewBookSource = {
    sourceUrl: trimmedUrl,
    bookSourceUrl: trimmedUrl,
    sourceName: trimmedName,
    sourceGroup: raw.sourceGroup ?? raw.bookSourceGroup,
    sourceType: raw.sourceType ?? raw.bookSourceType,
    sourceComment: raw.sourceComment ?? raw.bookSourceComment,
    enabled: raw.enabled,
    enableExplore: exploreEnabled,
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
    enabledCookieJar: cookieJar,
    eventListener: Boolean(raw.eventListener),
    customButton: Boolean(raw.customButton),
    nextPageLazyLoad: Boolean(raw.nextPageLazyLoad ?? raw.nextPagePreload),
  };
  return out;
}

function collectLegadoItems(data: unknown): LegadoSourceItem[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is LegadoSourceItem => !!item && typeof item === 'object');
  }
  if (data && typeof data === 'object') {
    const obj = data as LegadoSourceItem;
    if (Array.isArray(obj.sourceUrls)) {
      return [];
    }
    return [obj];
  }
  return [];
}

/**
 * legado 订阅列表格式：{ "sourceUrls": ["https://...", ...] }
 */
export function extractSourceUrlsEnvelope(jsonText: string): string[] {
  const trimmed = stripBom(jsonText);
  if (!trimmed.startsWith('{')) return [];
  try {
    const data = JSON.parse(trimmed) as LegadoSourceItem;
    if (!data || typeof data !== 'object' || !Array.isArray(data.sourceUrls)) return [];
    return data.sourceUrls
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter((u) => /^https?:\/\//i.test(u));
  } catch {
    return [];
  }
}

/**
 * 解析书源 JSON 字符串（支持单条对象或数组，兼容 legado 字段名）
 * @returns 规范后的书源列表，无效项已过滤
 */
export function parseBookSourceJson(jsonText: string): NewBookSource[] {
  const trimmed = stripBom(jsonText);
  if (!trimmed) return [];
  if (looksLikeHtml(trimmed)) {
    console.warn('[书源导入] 响应内容为 HTML，可能 URL 无效或未指向 JSON 文件');
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    console.warn('[书源导入] JSON 解析失败');
    return [];
  }

  const items = collectLegadoItems(data);
  const result: NewBookSource[] = [];
  for (const item of items) {
    const normalized = normalizeSourceItem(item);
    if (normalized) result.push(normalized);
  }
  return result;
}
