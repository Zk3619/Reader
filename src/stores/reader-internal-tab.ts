/**
 * 阅读模块内部 Tab（书架 / 探索 / 书源 / 书签 / 记录 / RSS）
 * 权威：settings.json via getStorage('reader_internal_tab')
 */

import { createSignal } from 'solid-js';
import { getStorage, setStorage } from '@/lib/platform/storage';

export type ReaderInternalTab =
  | 'shelf'
  | 'explore'
  | 'sources'
  | 'search'
  | 'bookmark'
  | 'record'
  | 'rss'
  | 'settings';

const STORAGE_KEY = 'reader_internal_tab';
const SESSION_MIRROR_KEY = 'reader_internal_tab_mirror';
const WEB_STORAGE_PREFIX = 'store_settings.json_';

const VALID_TABS = new Set<ReaderInternalTab>([
  'shelf',
  'explore',
  'sources',
  'search',
  'bookmark',
  'record',
  'rss',
  'settings',
]);

function normalizeTab(raw: unknown): ReaderInternalTab {
  return typeof raw === 'string' && VALID_TABS.has(raw as ReaderInternalTab)
    ? (raw as ReaderInternalTab)
    : 'shelf';
}

function mirrorToSession(tab: ReaderInternalTab): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_MIRROR_KEY, tab);
  } catch {
    /* */
  }
}

function mirrorLegacyLs(tab: ReaderInternalTab): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* */
  }
}

function peekSync(): ReaderInternalTab {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const mirrored = sessionStorage.getItem(SESSION_MIRROR_KEY);
      if (mirrored) return normalizeTab(mirrored);
    } catch {
      /* */
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const web = localStorage.getItem(`${WEB_STORAGE_PREFIX}${STORAGE_KEY}`);
      if (web) {
        const parsed = JSON.parse(web) as unknown;
        return normalizeTab(parsed);
      }
    } catch {
      /* */
    }
    try {
      return normalizeTab(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* */
    }
  }
  return 'shelf';
}

const [readerInternalTab, setReaderInternalTabSignal] = createSignal<ReaderInternalTab>(
  peekSync(),
);

/** 后台 warm：settings.json → 覆盖内存（并迁旧 LS） */
void getStorage<unknown>(STORAGE_KEY)
  .then((stored) => {
    if (stored != null) {
      const tab = normalizeTab(stored);
      setReaderInternalTabSignal(tab);
      mirrorToSession(tab);
      mirrorLegacyLs(tab);
      return;
    }
    // 一次性：裸 LS → settings.json
    const legacy = peekSync();
    if (legacy !== 'shelf' || (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY))) {
      void setStorage(STORAGE_KEY, legacy);
      mirrorToSession(legacy);
    }
  })
  .catch(() => undefined);

/** 导航到阅读页时待激活的 Tab（consume 后清空） */
const [pendingReaderTab, setPendingReaderTab] = createSignal<ReaderInternalTab | null>(null);

export function readerInternalTabValue(): ReaderInternalTab {
  return readerInternalTab();
}

export function setReaderInternalTab(tab: ReaderInternalTab): void {
  const next = normalizeTab(tab);
  setReaderInternalTabSignal(next);
  mirrorToSession(next);
  mirrorLegacyLs(next);
  void setStorage(STORAGE_KEY, next).catch(() => undefined);
}

export function requestReaderInternalTab(tab: ReaderInternalTab): void {
  setPendingReaderTab(tab);
}

export function consumePendingReaderTab(): ReaderInternalTab | null {
  const tab = pendingReaderTab();
  if (tab) setPendingReaderTab(null);
  return tab;
}
