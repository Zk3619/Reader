/**
 * 壳层 PageType 兼容与阅读模块内部 Tab 路由
 */

import type { PageType } from '@/components/shell/Navigation';
import {
  consumePendingReaderTab,
  requestReaderInternalTab,
  setReaderInternalTab,
  type ReaderInternalTab,
} from '@/stores/reader-internal-tab';

/** 旧 PageType → 壳 Tab */
const SHELL_TAB_ALIASES: Record<string, PageType> = {
  media: 'reader',
  bookshelf: 'reader',
  scout: 'reader',
  sources: 'reader',
  bookmark: 'reader',
  record: 'reader',
  'book-search': 'reader',
  'media-search': 'reader',
  /** Legado RSS 在阅读模块内部 Tab */
  rss: 'reader',
  /** Folo 占位壳 Tab */
  subscription: 'subscribe',
  subscribe: 'subscribe',
};

/** 旧 PageType → 阅读模块内部 Tab（若适用） */
const READER_INTERNAL_TAB_ALIASES: Record<string, ReaderInternalTab> = {
  media: 'shelf',
  bookshelf: 'shelf',
  scout: 'explore',
  sources: 'sources',
  'book-search': 'search',
  'media-search': 'search',
  bookmark: 'bookmark',
  record: 'record',
  rss: 'rss',
};

export function resolveShellTabFromPage(page: string): PageType {
  return (SHELL_TAB_ALIASES[page] ?? page) as PageType;
}

export function resolveReaderTabFromLegacyPage(page: string): ReaderInternalTab | null {
  return READER_INTERNAL_TAB_ALIASES[page] ?? null;
}

/** 导航前：将 legacy page 映射为壳 Tab + 可选的阅读内部 Tab */
export function prepareShellNavigation(page: PageType): PageType {
  const readerTab = resolveReaderTabFromLegacyPage(page);
  if (readerTab) {
    requestReaderInternalTab(readerTab);
  }
  return resolveShellTabFromPage(page);
}

/** 进入阅读壳 Tab 后应用 pending 内部 Tab */
export function applyPendingReaderInternalTab(): void {
  const tab = consumePendingReaderTab();
  if (tab) setReaderInternalTab(tab);
}

export function openReaderAtTab(tab: ReaderInternalTab): void {
  requestReaderInternalTab(tab);
}
