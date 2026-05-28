import { getEnabledSources, getSource, getSourcesByGroup } from '@/lib/database/sources';
import { getStorage, setStorage } from '@/lib/platform/storage';
import type { BookSource } from '@/types';

const STORAGE_KEY = 'book_search_scope';

/** 弹窗 UI 会话态（sessionStorage，关闭应用后清除；不写入 settings.json） */
const SESSION_TAB_KEY = 'book_search_scope_tab';
const SESSION_FUZZY_GROUP_KEY = 'book_search_scope_fuzzy_group';
const SESSION_FUZZY_SOURCE_KEY = 'book_search_scope_fuzzy_source';

export type SearchScopeTab = 'group' | 'source';

let memoryTab: SearchScopeTab = 'group';
let memoryFuzzyGroup = false;
let memoryFuzzySource = false;

function readSessionFlag(key: string, memory: boolean): boolean {
  if (typeof sessionStorage === 'undefined') return memory;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return memory;
    return raw === '1' || raw === 'true';
  } catch {
    return memory;
  }
}

function writeSessionFlag(key: string, value: boolean): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function readSessionTab(): SearchScopeTab {
  if (typeof sessionStorage === 'undefined') return memoryTab;
  try {
    const raw = sessionStorage.getItem(SESSION_TAB_KEY);
    return raw === 'source' ? 'source' : 'group';
  } catch {
    return memoryTab;
  }
}

function writeSessionTab(tab: SearchScopeTab): void {
  memoryTab = tab;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

const GROUP_SPLIT = /[,，;；]\s*/;

/** 多书源范围分隔（分组范围使用逗号，书源范围使用分号） */
const SOURCE_SCOPE_SPLIT = ';';

/** 分组 Tab 虚拟列表顶部的「未分组」项（对齐 Legado 未分组书源） */
export const SEARCH_SCOPE_UNGROUPED_LABEL = '未分组';

/** 书源分组名::书源URL */
export function formatSourceScope(source: BookSource): string {
  const safeName = (source.sourceName ?? '').replace(/:/g, '');
  return `${safeName}::${source.sourceUrl}`;
}

export function parseSourceScope(scope: string): { name: string; url: string } | null {
  const parts = parseSourceScopes(scope);
  return parts.length > 0 ? parts[0]! : null;
}

/** 解析一个或多个书源范围片段 */
export function parseSourceScopes(scope: string): { name: string; url: string }[] {
  const trimmed = scope.trim();
  if (!trimmed.includes('::')) return [];
  const segments = trimmed.includes(SOURCE_SCOPE_SPLIT)
    ? trimmed.split(SOURCE_SCOPE_SPLIT)
    : [trimmed];
  const out: { name: string; url: string }[] = [];
  for (const seg of segments) {
    const part = seg.trim();
    if (!part) continue;
    const idx = part.indexOf('::');
    if (idx < 0) continue;
    const url = part.slice(idx + 2).trim();
    if (!url) continue;
    out.push({ name: part.slice(0, idx), url });
  }
  return out;
}

export function formatSourceScopes(sources: BookSource[]): string {
  return sources.map((s) => formatSourceScope(s)).join(SOURCE_SCOPE_SPLIT);
}

export function scopeDisplayLabel(scope: string): string {
  if (!scope.trim()) return '全部书源';
  if (scope.includes('::')) {
    const parts = parseSourceScopes(scope);
    if (parts.length === 1) return parts[0]!.name || parts[0]!.url;
    if (parts.length > 1) return `${parts.length} 个书源`;
  }
  if (scope.includes(',')) return scope.split(',').filter(Boolean).join('、');
  return scope;
}

/** 更多菜单「搜索范围」项：全部/多选仅带固定后缀，单分组/单书源附带名称 */
export function scopeMenuItemLabel(scope: string): string {
  const trimmed = scope.trim();
  if (!trimmed) return '搜索范围：全部书源';
  if (trimmed.includes('::')) {
    const parts = parseSourceScopes(trimmed);
    if (parts.length === 1) {
      const name = parts[0]!.name || parts[0]!.url;
      return `搜索范围：${name}`;
    }
    return '搜索范围';
  }
  const groups = scopeDisplayNames(trimmed);
  if (groups.length === 1) return `搜索范围：${groups[0]}`;
  return '搜索范围';
}

export function scopeDisplayNames(scope: string): string[] {
  if (!scope.trim()) return [];
  if (scope.includes('::')) {
    return parseSourceScopes(scope).map((p) => p.name || p.url);
  }
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

/** 恢复搜索范围弹窗上次停留的 Tab（会话级） */
export function loadSearchScopeTab(): SearchScopeTab {
  return readSessionTab();
}

export function saveSearchScopeTab(tab: SearchScopeTab): void {
  writeSessionTab(tab);
}

export function loadSearchScopeFuzzy(tab: SearchScopeTab): boolean {
  return tab === 'source'
    ? readSessionFlag(SESSION_FUZZY_SOURCE_KEY, memoryFuzzySource)
    : readSessionFlag(SESSION_FUZZY_GROUP_KEY, memoryFuzzyGroup);
}

export function saveSearchScopeFuzzy(tab: SearchScopeTab, enabled: boolean): void {
  if (tab === 'source') {
    memoryFuzzySource = enabled;
    writeSessionFlag(SESSION_FUZZY_SOURCE_KEY, enabled);
  } else {
    memoryFuzzyGroup = enabled;
    writeSessionFlag(SESSION_FUZZY_GROUP_KEY, enabled);
  }
}

export function isUngroupedSource(source: BookSource): boolean {
  return !source.sourceGroup?.trim();
}

/** 是否存在已启用的未分组书源 */
export function hasEnabledUngroupedSources(sources: BookSource[]): boolean {
  return sources.some((s) => s.enabled && isUngroupedSource(s));
}

/** 分组 Tab 列表项：必要时在顶部插入「未分组」 */
export function buildSearchScopeGroupItems(
  sources: BookSource[],
  groupNames: string[],
): string[] {
  const items = [...groupNames];
  if (hasEnabledUngroupedSources(sources) && !items.includes(SEARCH_SCOPE_UNGROUPED_LABEL)) {
    return [SEARCH_SCOPE_UNGROUPED_LABEL, ...items];
  }
  return items;
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
  if (trimmed.includes('::')) {
    const parts = parseSourceScopes(trimmed);
    const merged: BookSource[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const one = await getSource(part.url);
      if (!one?.enabled || seen.has(one.sourceUrl)) continue;
      seen.add(one.sourceUrl);
      merged.push(one);
    }
    if (merged.length > 0) {
      return merged.sort((a, b) => (a.customOrder ?? 0) - (b.customOrder ?? 0));
    }
    return getEnabledSources();
  }
  const groupNames = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const merged: BookSource[] = [];
  const seen = new Set<string>();
  for (const groupName of groupNames) {
    if (groupName === SEARCH_SCOPE_UNGROUPED_LABEL) {
      const all = await getEnabledSources();
      for (const s of all) {
        if (!isUngroupedSource(s) || seen.has(s.sourceUrl)) continue;
        seen.add(s.sourceUrl);
        merged.push(s);
      }
      continue;
    }
    const list = await getSourcesByGroup(groupName);
    for (const s of list) {
      if (!s.enabled) continue;
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
