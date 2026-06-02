import { getEnabledSources, getSource, getSourcesByGroup } from '@/lib/database/sources';
import { deleteStorage, getStorage, setStorage } from '@/lib/platform/storage';
import type { BookSource } from '@/types';

/** 旧版扁平字符串（仅分组；迁移后删除） */
const LEGACY_STORAGE_KEY = 'book_search_scope';
/** 结构化持久化（分组 / 多书源 URL 列表） */
const STORAGE_KEY_V2 = 'book_search_scope_v2';
/** 超大范围单独落盘，避免撑大 settings.json */
const LARGE_SCOPE_FILE = 'search-scope.json';
const LARGE_SCOPE_KEY = 'payload';

/** 弹窗 UI 会话态（sessionStorage，关闭应用后清除；不写入 settings.json） */
const SESSION_TAB_KEY = 'book_search_scope_tab';
const SESSION_FUZZY_GROUP_KEY = 'book_search_scope_fuzzy_group';
const SESSION_FUZZY_SOURCE_KEY = 'book_search_scope_fuzzy_source';

export type SearchScopeTab = 'group' | 'source';

/** 持久化条目上限（超出则归一化为「全部书源」） */
export const SEARCH_SCOPE_MAX_PERSISTED_ITEMS = 500;
/** 持久化 JSON 体积上限（字节） */
export const SEARCH_SCOPE_MAX_PERSISTED_BYTES = 48_000;
/** 选中占比超过此阈值时等价于全选 */
export const SEARCH_SCOPE_NEAR_ALL_RATIO = 0.95;
/** 超过此体积写入独立 search-scope.json */
const INLINE_STORAGE_BYTE_LIMIT = 16_000;

export type StoredSearchScopeKind = 'all' | 'group' | 'source';

export interface StoredSearchScopeV2 {
  v: 2;
  kind: StoredSearchScopeKind;
  /** 分组名或书源 URL（书源仅存 URL，避免 name::url 膨胀） */
  items?: string[];
}

export type SaveSearchScopeResult =
  | { ok: true; persisted: 'all' | 'group' | 'source' | 'transient' | 'all-normalized' }
  | { ok: false; reason: 'oversized' | 'empty' };

/** transient：外部导航传入的范围，仅当次生效，不覆盖持久化设置 */
export interface SaveSearchScopeOptions {
  transient?: boolean;
}

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

/** 多书源紧凑运行时格式（仅 URL，解析时无需书名） */
export function formatSourceScopeUrls(urls: string[]): string {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return `::${unique[0]}`;
  return unique.map((url) => `::${url}`).join(SOURCE_SCOPE_SPLIT);
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

function isStoredSearchScopeV2(value: unknown): value is StoredSearchScopeV2 {
  if (!value || typeof value !== 'object') return false;
  const v = value as StoredSearchScopeV2;
  return v.v === 2 && (v.kind === 'all' || v.kind === 'group' || v.kind === 'source');
}

/** 运行时 scope 字符串 → 结构化持久化形态 */
export function encodeScopeForStorage(scope: string): StoredSearchScopeV2 {
  const trimmed = scope.trim();
  if (!trimmed) return { v: 2, kind: 'all' };
  if (isSourceScope(trimmed)) {
    const urls = [...new Set(parseSourceScopes(trimmed).map((p) => p.url).filter(Boolean))];
    return { v: 2, kind: 'source', items: urls };
  }
  const groups = scopeDisplayNames(trimmed);
  if (groups.length === 1) return { v: 2, kind: 'group', items: groups };
  return { v: 2, kind: 'group', items: groups };
}

/** 结构化持久化 → 运行时 scope 字符串（同步，书源名称为空时使用 ::url） */
export function decodeScopeFromStorage(stored: StoredSearchScopeV2): string {
  if (stored.kind === 'all') return '';
  const items = (stored.items ?? []).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return '';
  if (stored.kind === 'group') return items.join(',');
  return formatSourceScopeUrls(items);
}

function legacyStringToStored(scope: string): StoredSearchScopeV2 {
  const trimmed = scope.trim();
  if (!trimmed) return { v: 2, kind: 'all' };
  if (isSourceScope(trimmed)) {
    return encodeScopeForStorage(trimmed);
  }
  return { v: 2, kind: 'group', items: scopeDisplayNames(trimmed) };
}

/** 归一化持久化条目：接近全选 / 超限 / 体积过大 → 全部书源 */
export function normalizeStoredSearchScope(
  stored: StoredSearchScopeV2,
  options?: { enabledSourceCount?: number; enabledGroupCount?: number },
): StoredSearchScopeV2 {
  if (stored.kind === 'all') return stored;
  const items = (stored.items ?? []).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return { v: 2, kind: 'all' };

  const { enabledSourceCount = 0, enabledGroupCount = 0 } = options ?? {};

  if (stored.kind === 'source') {
    if (
      enabledSourceCount > 0 &&
      items.length >= Math.ceil(enabledSourceCount * SEARCH_SCOPE_NEAR_ALL_RATIO)
    ) {
      return { v: 2, kind: 'all' };
    }
  } else if (
    enabledGroupCount > 0 &&
    items.length >= Math.ceil(enabledGroupCount * SEARCH_SCOPE_NEAR_ALL_RATIO)
  ) {
    return { v: 2, kind: 'all' };
  }

  if (items.length > SEARCH_SCOPE_MAX_PERSISTED_ITEMS) {
    return { v: 2, kind: 'all' };
  }

  const candidate: StoredSearchScopeV2 = { v: 2, kind: stored.kind, items };
  if (JSON.stringify(candidate).length > SEARCH_SCOPE_MAX_PERSISTED_BYTES) {
    return { v: 2, kind: 'all' };
  }
  return candidate;
}

async function readStoredScope(): Promise<StoredSearchScopeV2 | null> {
  const large = await getStorage<StoredSearchScopeV2>(LARGE_SCOPE_KEY, LARGE_SCOPE_FILE);
  if (isStoredSearchScopeV2(large) && large.kind !== 'all') {
    return large;
  }

  const inline = await getStorage<StoredSearchScopeV2>(STORAGE_KEY_V2);
  if (isStoredSearchScopeV2(inline)) return inline;

  const legacy = await getStorage<string>(LEGACY_STORAGE_KEY);
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacyStringToStored(legacy);
  }
  return null;
}

async function writeStoredScope(stored: StoredSearchScopeV2): Promise<void> {
  const json = JSON.stringify(stored);
  if (json.length > INLINE_STORAGE_BYTE_LIMIT) {
    await setStorage(LARGE_SCOPE_KEY, stored, LARGE_SCOPE_FILE);
    await deleteStorage(STORAGE_KEY_V2);
    return;
  }
  await setStorage(STORAGE_KEY_V2, stored);
  await deleteStorage(LARGE_SCOPE_KEY, LARGE_SCOPE_FILE);
}

async function clearLegacyScopeStorage(): Promise<void> {
  await deleteStorage(LEGACY_STORAGE_KEY);
}

/** 加载持久化搜索范围（含搜索页弹窗确认的单书源；不含探索/书源页导航传入的 initialScope） */
export async function loadSearchScope(): Promise<string> {
  const stored = await readStoredScope();
  if (!stored) return '';

  const scope = decodeScopeFromStorage(stored);
  if (await getStorage<string>(LEGACY_STORAGE_KEY)) {
    await writeStoredScope(stored);
    await clearLegacyScopeStorage();
  }
  return scope;
}

/**
 * 保存搜索范围。
 * - 全部 / 分组 / 书源（含单书源）：写入持久化（结构化，书源仅存 URL）
 * - transient：探索/书源页经 initialScope 传入的范围，仅当次生效，不覆盖持久化
 */
export async function saveSearchScope(
  scope: string,
  options?: SaveSearchScopeOptions,
): Promise<SaveSearchScopeResult> {
  if (options?.transient) {
    return { ok: true, persisted: 'transient' };
  }

  const trimmed = scope.trim();
  if (!trimmed) {
    await writeStoredScope({ v: 2, kind: 'all' });
    await clearLegacyScopeStorage();
    return { ok: true, persisted: 'all' };
  }

  if (isSourceScope(trimmed)) {
    const enabled = await getEnabledSources();
    const encoded = encodeScopeForStorage(trimmed);
    const normalized = normalizeStoredSearchScope(encoded, {
      enabledSourceCount: enabled.length,
    });
    await writeStoredScope(normalized);
    await clearLegacyScopeStorage();
    if (normalized.kind === 'all') {
      return { ok: true, persisted: 'all-normalized' };
    }
    return { ok: true, persisted: 'source' };
  }

  const enabled = await getEnabledSources();
  const groupItems = buildSearchScopeGroupItems(enabled, collectSourceGroupNames(enabled));
  const encoded = encodeScopeForStorage(trimmed);
  const normalized = normalizeStoredSearchScope(encoded, {
    enabledGroupCount: groupItems.length,
  });
  await writeStoredScope(normalized);
  await clearLegacyScopeStorage();
  if (normalized.kind === 'all') {
    return { ok: true, persisted: 'all-normalized' };
  }
  return { ok: true, persisted: 'group' };
}

/**
 * 加载后清理失效分组/书源（对齐 Legado SearchScope 自动剔除无效分组）
 */
export async function sanitizeSearchScope(scope: string): Promise<string> {
  const trimmed = scope.trim();
  if (!trimmed) return '';

  if (isSourceScope(trimmed)) {
    const validUrls: string[] = [];
    for (const part of parseSourceScopes(trimmed)) {
      const source = await getSource(part.url);
      if (source?.enabled) validUrls.push(source.sourceUrl);
    }
    if (validUrls.length === 0) return '';
    if (validUrls.length === 1) {
      const source = await getSource(validUrls[0]!);
      return source ? formatSourceScope(source) : `::${validUrls[0]}`;
    }
    return formatSourceScopeUrls(validUrls);
  }

  const enabled = await getEnabledSources();
  const allGroups = buildSearchScopeGroupItems(enabled, collectSourceGroupNames(enabled));
  const groupSet = new Set(allGroups);
  const requested = scopeDisplayNames(trimmed);
  const validGroups = requested.filter((g) => groupSet.has(g));
  if (validGroups.length === 0) return '';
  const sanitized = validGroups.join(',');
  const resolved = await resolveSearchScopeSources(sanitized);
  if (resolved.length === 0) return '';
  return sanitized;
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
