/**
 * 订阅管理页搜索偏好：范围（标题/URL/分类）+ 模式（常规/精准/模糊）
 */

import { createStore } from 'solid-js/store';
import { continuousContains } from '@/lib/search/search-match';
import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import type { SubSourceRow } from '@/lib/database/subscribe';

export type SubscribeManageSearchScope = 'title' | 'url' | 'category';
export type SubscribeManageSearchMode = 'normal' | 'precise' | 'fuzzy';

export type SubscribeManageSearchPrefs = {
  scopes: SubscribeManageSearchScope[];
  mode: SubscribeManageSearchMode;
};

const STORAGE_KEY = 'reader_subscribe_manage_search_prefs_v1';

export const DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS: SubscribeManageSearchPrefs = {
  scopes: ['title', 'url', 'category'],
  mode: 'normal',
};

function normalizePrefs(raw: unknown): SubscribeManageSearchPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scopesRaw = Array.isArray(obj.scopes)
    ? obj.scopes
    : DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS.scopes;
  const scopes = scopesRaw.filter(
    (s): s is SubscribeManageSearchScope =>
      s === 'title' || s === 'url' || s === 'category',
  );
  const mode: SubscribeManageSearchMode =
    obj.mode === 'precise' || obj.mode === 'fuzzy' || obj.mode === 'normal'
      ? obj.mode
      : 'normal';
  return { scopes, mode };
}

function readStored(): SubscribeManageSearchPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS, scopes: [...DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS.scopes] };
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS,
      scopes: [...DEFAULT_SUBSCRIBE_MANAGE_SEARCH_PREFS.scopes],
    };
  }
}

const [prefs, setPrefs] = createStore<SubscribeManageSearchPrefs>(readStored());

export function getSubscribeManageSearchPrefs(): SubscribeManageSearchPrefs {
  return prefs;
}

export function setSubscribeManageSearchPrefs(next: SubscribeManageSearchPrefs): void {
  const normalized = normalizePrefs(next);
  const mode = normalized.mode || 'normal';
  setPrefs({ scopes: normalized.scopes, mode });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scopes: normalized.scopes, mode }));
  } catch {
    // ignore
  }
}

export function subscribeManageSearchPrefsEqual(
  a: SubscribeManageSearchPrefs,
  b: SubscribeManageSearchPrefs,
): boolean {
  if (a.mode !== b.mode) return false;
  if (a.scopes.length !== b.scopes.length) return false;
  return [...a.scopes].sort().join(',') === [...b.scopes].sort().join(',');
}

function fieldTexts(
  source: SubSourceRow,
  scopes: SubscribeManageSearchScope[],
): string[] {
  const active: SubscribeManageSearchScope[] =
    scopes.length > 0 ? scopes : ['title', 'url', 'category'];
  const out: string[] = [];
  for (const s of active) {
    if (s === 'title') out.push(source.title || '');
    else if (s === 'url') out.push(source.url || '');
    else out.push(source.category?.trim() || '未分类');
  }
  return out;
}

/** 按管理页搜索偏好过滤订阅源列表 */
export function filterSourcesByManageSearch(
  sources: SubSourceRow[],
  keyword: string,
  queryPrefs: SubscribeManageSearchPrefs = getSubscribeManageSearchPrefs(),
): SubSourceRow[] {
  const key = keyword.trim();
  if (!key) return sources;

  return sources.filter((source) => {
    const fields = fieldTexts(source, queryPrefs.scopes);
    if (queryPrefs.mode === 'precise') {
      const lower = key.toLowerCase();
      return fields.some((f) => f.trim().toLowerCase() === lower);
    }
    if (queryPrefs.mode === 'fuzzy') {
      return fields.some((f) => fuzzyMatchQuery(key, f));
    }
    // normal：连续包含
    const lower = key.toLowerCase();
    return fields.some((f) => continuousContains(f.toLowerCase(), lower));
  });
}
