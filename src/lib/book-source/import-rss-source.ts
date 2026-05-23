import type { NewRssSource } from '@/types';

interface LegadoRssItem {
  [key: string]: unknown;
  sourceUrl?: string;
  rssSourceUrl?: string;
  sourceName?: string;
  rssSourceName?: string;
}

function normalizeRssItem(raw: LegadoRssItem): NewRssSource | null {
  const sourceUrl = raw.sourceUrl ?? raw.rssSourceUrl;
  const sourceName = raw.sourceName ?? raw.rssSourceName;
  if (!sourceUrl || !sourceName) return null;
  const url = String(sourceUrl).trim();
  const name = String(sourceName).trim();
  if (!url || !name) return null;
  return {
    sourceUrl: url,
    sourceName: name,
    sourceGroup: raw.sourceGroup != null ? String(raw.sourceGroup) : undefined,
    sourceComment: raw.sourceComment != null ? String(raw.sourceComment) : undefined,
    sourceIcon: raw.sourceIcon != null ? String(raw.sourceIcon) : undefined,
    enabled: raw.enabled as boolean | undefined,
    singleUrl: Boolean(raw.singleUrl),
    articleStyle: typeof raw.articleStyle === 'number' ? raw.articleStyle : undefined,
    ruleArticles: raw.ruleArticles != null ? String(raw.ruleArticles) : undefined,
    ruleTitle: raw.ruleTitle != null ? String(raw.ruleTitle) : undefined,
    ruleLink: raw.ruleLink != null ? String(raw.ruleLink) : undefined,
    ruleContent: raw.ruleContent != null ? String(raw.ruleContent) : undefined,
    header: raw.header != null ? String(raw.header) : undefined,
    jsLib: raw.jsLib != null ? String(raw.jsLib) : undefined,
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
