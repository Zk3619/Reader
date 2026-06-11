import type { NewRssSource } from '@/types';
import { stripLegadoSourceUrlMarker } from '@/lib/book-source/utils';

interface LegadoRssItem {
  [key: string]: unknown;
  sourceUrl?: string;
  rssSourceUrl?: string;
  sourceName?: string;
  rssSourceName?: string;
}

/** Legado 订阅源 JSON 可导入的标量字段（对齐 RssSource.kt） */
const RSS_SCALAR_KEYS = [
  'sourceGroup',
  'sourceComment',
  'sourceIcon',
  'variableComment',
  'loginCheckJs',
  'coverDecodeJs',
  'sortUrl',
  'singleUrl',
  'articleStyle',
  'ruleArticles',
  'ruleNextPage',
  'ruleTitle',
  'rulePubDate',
  'ruleDescription',
  'ruleImage',
  'ruleLink',
  'ruleContent',
  'contentWhitelist',
  'contentBlacklist',
  'shouldOverrideUrlLoading',
  'style',
  'enableJs',
  'loadWithBaseUrl',
  'injectJs',
  'preloadJs',
  'startHtml',
  'startStyle',
  'startJs',
  'showWebLog',
  'type',
  'preload',
  'cacheFirst',
  'searchUrl',
  'header',
  'loginUrl',
  'loginUi',
  'jsLib',
  'enabledCookieJar',
  'customOrder',
  'lastUpdateTime',
  'enabled',
] as const;

function pickScalarFields(raw: LegadoRssItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RSS_SCALAR_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    }
  }
  return out;
}

function normalizeRssItem(raw: LegadoRssItem): NewRssSource | null {
  const sourceUrl = raw.sourceUrl ?? raw.rssSourceUrl;
  const sourceName = raw.sourceName ?? raw.rssSourceName;
  if (!sourceUrl || !sourceName) return null;
  const url = stripLegadoSourceUrlMarker(String(sourceUrl).trim());
  const name = String(sourceName).trim();
  if (!url || !name) return null;
  const comment =
    typeof raw.sourceComment === 'string' ? raw.sourceComment.trim() : '';
  const inlineComment = String(sourceUrl).includes('##')
    ? String(sourceUrl).trim().slice(String(sourceUrl).trim().indexOf('##') + 2).trim()
    : '';
  return {
    ...pickScalarFields(raw),
    sourceUrl: url,
    sourceComment: comment || inlineComment || undefined,
    sourceName: name,
    enabled: raw.enabled !== false,
    singleUrl: Boolean(raw.singleUrl),
    articleStyle: typeof raw.articleStyle === 'number' ? raw.articleStyle : 0,
    enableJs: raw.enableJs !== false,
    loadWithBaseUrl: raw.loadWithBaseUrl !== false,
  };
}

export function parseRssSourceJson(jsonText: string): NewRssSource[] {
  const trimmed = jsonText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : [data];
  const out: NewRssSource[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const n = normalizeRssItem(item as LegadoRssItem);
    if (n) out.push(n);
  }
  return out;
}
