/**
 * 订阅源编辑：Legado JSON ↔ Reader RssSource / 数据库
 */

import type { RssSource } from '@/types';
import type { RssSourceEditField } from '@/lib/rss-source/rss-source-edit-config';
import { autoCompleteRule } from '@/lib/book-source/rule-complete';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import { clearSortUrlCache } from '@/lib/rss-source/sort-urls';
import { dispatchRssSourcesRefresh } from '@/lib/rss/rss-sources-refresh-event';

const AUTO_COMPLETE_STORAGE_KEY = 'reader_rss_source_edit_auto_complete';

export function readRssSourceAutoCompleteEnabled(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_COMPLETE_STORAGE_KEY);
    if (stored === null) return false;
    return stored !== '0';
  } catch {
    return false;
  }
}

export function writeRssSourceAutoCompleteEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_COMPLETE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ruleComplete(
  rule: string | undefined,
  preRule: string | undefined,
  type = 1,
  enabled: boolean,
): string | undefined {
  if (!enabled || !rule?.trim()) return rule;
  return autoCompleteRule(rule, preRule, type) ?? rule;
}

/** 保存前规则补全（对齐 Legado RssSourceEditActivity） */
export function applyRssRuleComplete(edit: RssSource, enabled: boolean): RssSource {
  if (!enabled) return edit;
  const next = { ...edit };
  const pre = next.ruleArticles;
  next.ruleNextPage = ruleComplete(next.ruleNextPage, pre, 2, true);
  next.ruleTitle = ruleComplete(next.ruleTitle, pre, 1, true);
  next.rulePubDate = ruleComplete(next.rulePubDate, pre, 1, true);
  next.ruleDescription = ruleComplete(next.ruleDescription, pre, 1, true);
  next.ruleImage = ruleComplete(next.ruleImage, pre, 3, true);
  next.ruleLink = ruleComplete(next.ruleLink, pre, 2, true);
  next.ruleContent = ruleComplete(next.ruleContent, undefined, 1, true);
  return next;
}

export function createEmptyRssEditSource(): RssSource {
  return {
    sourceUrl: '',
    sourceName: '新订阅源',
    sourceIcon: '',
    enabled: true,
    singleUrl: false,
    articleStyle: 0,
    enableJs: true,
    loadWithBaseUrl: true,
    lastUpdateTime: 0,
    customOrder: Date.now(),
    showWebLog: false,
    type: 0,
    preload: false,
    cacheFirst: false,
    enabledCookieJar: false,
  };
}

function normalizeRssEditSource(raw: Partial<RssSource>): RssSource {
  const base = createEmptyRssEditSource();
  return {
    ...base,
    ...raw,
    sourceUrl: String(raw.sourceUrl ?? '').trim(),
    sourceName: String(raw.sourceName ?? base.sourceName).trim(),
    sourceIcon: String(raw.sourceIcon ?? ''),
    enabled: raw.enabled !== false,
    singleUrl: Boolean(raw.singleUrl),
    articleStyle: Number(raw.articleStyle ?? 0),
    enableJs: raw.enableJs !== false,
    loadWithBaseUrl: raw.loadWithBaseUrl !== false,
    showWebLog: Boolean(raw.showWebLog),
    type: Number(raw.type ?? 0),
    preload: Boolean(raw.preload),
    cacheFirst: Boolean(raw.cacheFirst),
    enabledCookieJar: Boolean(raw.enabledCookieJar),
    customOrder: Number(raw.customOrder ?? Date.now()),
    lastUpdateTime: Number(raw.lastUpdateTime ?? 0),
  };
}

function pruneEmptyStrings(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && !v.trim()) {
      delete obj[key];
    }
  }
}

export function rssEditToExportObject(edit: RssSource): Record<string, unknown> {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(edit));
  pruneEmptyStrings(out);
  return out;
}

export function serializeRssEditSource(edit: RssSource): string {
  return JSON.stringify(rssEditToExportObject(edit), null, 2);
}

export function parseRssEditFromText(text: string): RssSource {
  const parsed = parseRssSourceJson(text);
  if (parsed.length === 0) {
    let data: unknown;
    try {
      data = JSON.parse(text.replace(/^\uFEFF/, '').trim());
    } catch {
      throw new Error('无法解析订阅源 JSON，请检查格式');
    }
    const item = (Array.isArray(data) ? data[0] : data) as Partial<RssSource>;
    if (!item || typeof item !== 'object') {
      throw new Error('无法解析订阅源 JSON，请检查格式');
    }
    return normalizeRssEditSource(item);
  }
  return normalizeRssEditSource(parsed[0] as RssSource);
}

export async function loadRssEditSource(sourceUrl: string): Promise<RssSource> {
  const source = await rssSourcesDb.getRssSource(sourceUrl);
  if (!source) {
    throw new Error('订阅源不存在');
  }
  return normalizeRssEditSource(source);
}

export async function saveRssEditSource(
  edit: RssSource,
  originalUrl?: string,
  options?: { autoComplete?: boolean },
): Promise<RssSource> {
  const url = edit.sourceUrl.trim();
  const name = edit.sourceName.trim();
  if (!url || !name) {
    throw new Error('源名称和源域名不能为空');
  }

  const autoComplete = options?.autoComplete ?? readRssSourceAutoCompleteEnabled();
  const prepared = applyRssRuleComplete(
    normalizeRssEditSource({ ...edit, sourceUrl: url, sourceName: name }),
    autoComplete,
  );

  const toSave: RssSource = {
    ...prepared,
    lastUpdateTime: Date.now(),
  };

  let isNew = false;
  if (originalUrl && originalUrl !== url) {
    await rssSourcesDb.deleteRssSource(originalUrl);
    await rssSourcesDb.insertRssSource(toSave);
    isNew = true;
  } else {
    const existing = await rssSourcesDb.getRssSource(url);
    if (existing) {
      await rssSourcesDb.updateRssSource(toSave);
    } else {
      await rssSourcesDb.insertRssSource(toSave);
      isNew = true;
    }
  }

  clearSortUrlCache(toSave);
  dispatchRssSourcesRefresh({
    reason: isNew ? 'source-added' : 'source-updated',
    invalidateCache: isNew || Boolean(originalUrl && originalUrl !== url),
  });

  const saved = await rssSourcesDb.getRssSource(url);
  if (!saved) {
    throw new Error('保存后未能读取订阅源');
  }
  return saved;
}

export function getRssEditFieldValue(
  source: RssSource,
  field: RssSourceEditField,
): string | number | boolean | undefined {
  const v = source[field.id as keyof RssSource];
  if (v === undefined || v === null) {
    return field.type === 'String' ? '' : undefined;
  }
  if (field.type === 'Boolean') return Boolean(v);
  if (field.type === 'Number') return Number(v);
  return String(v);
}

export function setRssEditFieldValue(
  source: RssSource,
  field: RssSourceEditField,
  value: string | number | boolean,
): void {
  if (field.type === 'String' && typeof value === 'string' && !value.trim()) {
    delete (source as Record<string, unknown>)[field.id];
    return;
  }
  (source as Record<string, unknown>)[field.id] = value;
}

export function rssEditSnapshot(edit: RssSource): string {
  return JSON.stringify(edit);
}
