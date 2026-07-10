/**
 * 阅读模块内部 Tab（书架 / 探索 / 书源 / 书签 / 记录 / RSS）
 */

import { createSignal } from 'solid-js';

export type ReaderInternalTab =
  | 'shelf'
  | 'explore'
  | 'sources'
  | 'bookmark'
  | 'record'
  | 'rss'
  | 'settings';

const STORAGE_KEY = 'reader_internal_tab';

function readStoredTab(): ReaderInternalTab {
  if (typeof localStorage === 'undefined') return 'shelf';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (
    raw === 'shelf' ||
    raw === 'explore' ||
    raw === 'sources' ||
    raw === 'bookmark' ||
    raw === 'record' ||
    raw === 'rss' ||
    raw === 'settings'
  ) {
    return raw;
  }
  return 'shelf';
}

const [readerInternalTab, setReaderInternalTabSignal] = createSignal<ReaderInternalTab>(
  readStoredTab(),
);

/** 导航到阅读页时待激活的 Tab（consume 后清空） */
const [pendingReaderTab, setPendingReaderTab] = createSignal<ReaderInternalTab | null>(null);

export function readerInternalTabValue(): ReaderInternalTab {
  return readerInternalTab();
}

export function setReaderInternalTab(tab: ReaderInternalTab): void {
  setReaderInternalTabSignal(tab);
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function requestReaderInternalTab(tab: ReaderInternalTab): void {
  setPendingReaderTab(tab);
}

export function consumePendingReaderTab(): ReaderInternalTab | null {
  const tab = pendingReaderTab();
  if (tab) setPendingReaderTab(null);
  return tab;
}
