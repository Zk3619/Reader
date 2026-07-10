/**
 * MediaShelf 路由/事件/存储兼容层
 */

import { getStorage, setStorage } from '@/lib/platform/storage';
import type { PageType } from '@/components/shell/Navigation';
import { resolveShellTabFromPage } from '@/lib/modules/shell-compat';

export const MEDIA_REFRESH_EVENT = 'media-refresh';
export const LEGACY_BOOKSHELF_REFRESH_EVENT = 'bookshelf-refresh';

const PAGE_TYPE_ALIASES: Record<string, PageType> = {
  media: 'reader',
  bookshelf: 'reader',
  scout: 'reader',
  sources: 'reader',
  bookmark: 'reader',
  record: 'reader',
  rss: 'reader',
  subscription: 'subscribe',
  'bookshelf-cache': 'media-cache',
  'book-search': 'media-search',
};

const LEGACY_PAGE_TYPES = new Set([
  'bookshelf',
  'media',
  'scout',
  'sources',
  'bookmark',
  'record',
  'rss',
  'subscription',
  'bookshelf-cache',
  'book-search',
]);

/** 将旧 PageType 归一化为当前壳 Tab */
export function normalizePageType(page: string): PageType {
  return resolveShellTabFromPage(PAGE_TYPE_ALIASES[page] ?? page);
}

export function isLegacyPageType(page: string): boolean {
  return LEGACY_PAGE_TYPES.has(page);
}

/** 派发媒体库刷新（双发兼容旧监听） */
export function dispatchMediaRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MEDIA_REFRESH_EVENT));
  window.dispatchEvent(new CustomEvent(LEGACY_BOOKSHELF_REFRESH_EVENT));
}

/** 注册刷新监听（同时监听新旧事件） */
export function onMediaRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(MEDIA_REFRESH_EVENT, handler);
  window.addEventListener(LEGACY_BOOKSHELF_REFRESH_EVENT, handler);
  return () => {
    window.removeEventListener(MEDIA_REFRESH_EVENT, handler);
    window.removeEventListener(LEGACY_BOOKSHELF_REFRESH_EVENT, handler);
  };
}

const STORAGE_ALIASES: Record<string, string> = {
  bookshelf_currentGroup: 'media_current_group',
  bookshelf_currentGroupName: 'media_current_group_name',
  bookshelf_showGroupList: 'media_show_group_list',
};

/** 读取：优先新 key，fallback 旧 key */
export async function getMediaShelfStorage<T>(key: string): Promise<T | null> {
  const newKey = STORAGE_ALIASES[key] ?? key.replace(/^bookshelf_/, 'media_');
  const v = await getStorage<T>(newKey);
  if (v != null) return v;
  return getStorage<T>(key);
}

/** 写入：仅新 key */
export async function setMediaShelfStorage<T>(key: string, value: T): Promise<void> {
  const newKey = STORAGE_ALIASES[key] ?? key.replace(/^bookshelf_/, 'media_');
  await setStorage(newKey, value);
}
