import { getEnabledSources, getSource, getSourcesByGroup } from '@/lib/database/sources';
import { getStorage, setStorage } from '@/lib/platform/storage';
import type { BookSource } from '@/types';

const STORAGE_KEY = 'book_search_scope';

const GROUP_SPLIT = /[,，;；]\s*/;

/** 书源分组名::书源URL */
export function formatSourceScope(source: BookSource): string {
  const safeName = (source.sourceName ?? '').replace(/:/g, '');
  return `${safeName}::${source.sourceUrl}`;
}

export function parseSourceScope(scope: string): { name: string; url: string } | null {
  if (!scope.includes('::')) return null;
  const [name, url] = scope.split('::');
  if (!url?.trim()) return null;
  return { name: name ?? '', url: url.trim() };
}

export function scopeDisplayLabel(scope: string): string {
  if (!scope.trim()) return '全部书源';
  const parsed = parseSourceScope(scope);
  if (parsed) return parsed.name || parsed.url;
  if (scope.includes(',')) return scope.split(',').filter(Boolean).join('、');
  return scope;
}

export function scopeDisplayNames(scope: string): string[] {
  if (!scope.trim()) return [];
  const parsed = parseSourceScope(scope);
  if (parsed) return [parsed.name || parsed.url];
  return scope.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isSourceScope(scope: string): boolean {
  return scope.includes('::');
}

export function isAllSourceScope(scope: string): boolean {
  return !scope.trim();
}

export async function loadSearchScope(): Promise<string> {
  const v = await getStorage<string>(STORAGE_KEY);
  return typeof v === 'string' ? v : '';
}

export async function saveSearchScope(scope: string): Promise<void> {
  if (!isSourceScope(scope)) {
    await setStorage(STORAGE_KEY, scope);
  }
}

function sourceInGroup(source: BookSource, groupName: string): boolean {
  const g = source.sourceGroup?.trim();
  if (!g) return false;
  return g.split(GROUP_SPLIT).some((part) => part.trim() === groupName);
}

/** 从已启用书源收集去重分组名 */
export function collectSourceGroupNames(sources: BookSource[]): string[] {
  const names = new Set<string>();
  for (const s of sources) {
    const g = s.sourceGroup?.trim();
    if (!g) continue;
    for (const part of g.split(GROUP_SPLIT)) {
      const t = part.trim();
      if (t) names.add(t);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * 解析搜索范围对应的启用书源列表（对齐 Legado SearchScope.getBookSourceParts）
 */
export async function resolveSearchScopeSources(scope: string): Promise<BookSource[]> {
  const trimmed = scope.trim();
  if (!trimmed) {
    return getEnabledSources();
  }
  const parsed = parseSourceScope(trimmed);
  if (parsed) {
    const one = await getSource(parsed.url);
    if (one?.enabled) return [one];
    return [];
  }
  const groupNames = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const merged: BookSource[] = [];
  const seen = new Set<string>();
  for (const groupName of groupNames) {
    const list = await getSourcesByGroup(groupName);
    for (const s of list) {
      if (!s.enabled) continue;
      if (!sourceInGroup(s, groupName) && s.sourceGroup?.includes(',') === false) {
        // getSourcesByGroup 已按 SQL 匹配
      }
      if (seen.has(s.sourceUrl)) continue;
      seen.add(s.sourceUrl);
      merged.push(s);
    }
  }
  if (merged.length > 0) {
    return merged.sort((a, b) => (a.customOrder ?? 0) - (b.customOrder ?? 0));
  }
  return getEnabledSources();
}
