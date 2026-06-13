import type { RssSourceEditField } from '@/lib/rss-source-edit-config';
import type { WebRssSource } from '@/lib/api';

export type RssEditSource = WebRssSource & {
  sourceUrl: string;
  sourceName: string;
};

export function createEmptyRssEditSource(): RssEditSource {
  return {
    sourceUrl: '',
    sourceName: '',
    sourceIcon: '',
    enabled: true,
    singleUrl: false,
    articleStyle: 0,
    enableJs: false,
    loadWithBaseUrl: true,
    showWebLog: false,
    type: 0,
    preload: false,
    cacheFirst: false,
    customOrder: 0,
    lastUpdateTime: Date.now(),
  };
}

export function apiRssSourceToEdit(source: WebRssSource): RssEditSource {
  return { ...createEmptyRssEditSource(), ...source };
}

export function rssEditSnapshot(edit: RssEditSource): string {
  return JSON.stringify(edit);
}

export function cloneRssEdit(source: RssEditSource): RssEditSource {
  return JSON.parse(JSON.stringify(source)) as RssEditSource;
}

export function getRssEditFieldValue(
  source: RssEditSource,
  field: RssSourceEditField,
): string | number | boolean | undefined {
  const v = source[field.id as keyof RssEditSource];
  if (v === undefined || v === null) return field.type === 'String' ? '' : undefined;
  if (field.type === 'Boolean') return Boolean(v);
  if (field.type === 'Number') return Number(v);
  return String(v);
}

export function setRssEditFieldValue(
  source: RssEditSource,
  field: RssSourceEditField,
  value: string | number | boolean,
): void {
  (source as Record<string, unknown>)[field.id] = value;
}

export function parseRssEditFromText(text: string): RssEditSource {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) throw new Error('无法解析订阅源 JSON');
  return apiRssSourceToEdit(list[0] as WebRssSource);
}

export function serializeRssEditSource(edit: RssEditSource): string {
  return JSON.stringify(edit, null, 2);
}
