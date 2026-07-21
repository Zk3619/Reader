/**
 * 阅读时章节缓存预取（向前 / 向后分离，对齐 Legado ReadBook.preDownload 向后语义）
 */

import * as sourcesDb from '@/lib/database/sources';
import { normalizeCatalogChapterIndices } from '@/lib/chapter-cache/catalog-cache-index';
import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';
import {
  fetchAndCacheChapterContent,
  readCachedChapterRaw,
} from '@/lib/chapter-cache/storage';
import type { Book, BookChapter, BookSource } from '@/types';
import type { ChapterCacheSettings } from '@/lib/chapter-cache/settings';
import { isInnerWebAwaiting } from '@/lib/platform/inner-web';

const MAX_PREFETCH_INFLIGHT = 2;
const MAX_FAIL_RETRIES = 3;
/** 对齐 Legado downloadIndex：预下载前延迟，减轻书源并发压力 */
const PREFETCH_DELAY_MS = 1000;

const inflight = new Set<string>();
const pumping = new Set<string>();
const sessionDone = new Set<string>();
const sessionFailCount = new Map<string, number>();

interface PrefetchSession {
  bookUrl: string;
  book: Book;
  catalog: BookChapter[];
  currentIndex: number;
  source: BookSource;
  targets: number[];
  cursor: number;
  cancelled: boolean;
}

const sessions = new Map<string, PrefetchSession>();

type ChapterPrefetchSettingsListener = () => void;
const prefetchSettingsListeners = new Set<ChapterPrefetchSettingsListener>();

/** 章节正文预下载配置变更（向前/向后章数） */
export function subscribeChapterPrefetchSettingsChange(
  listener: ChapterPrefetchSettingsListener,
): () => void {
  prefetchSettingsListeners.add(listener);
  return () => prefetchSettingsListeners.delete(listener);
}

function notifyChapterPrefetchSettingsChange(): void {
  for (const listener of prefetchSettingsListeners) {
    listener();
  }
}

function clearPrefetchSessionState(bookUrl: string): void {
  cancelPrefetchOnRead(bookUrl);
  for (const key of sessionDone) {
    if (key.startsWith(`${bookUrl}#`)) {
      sessionDone.delete(key);
    }
  }
  for (const key of sessionFailCount.keys()) {
    if (key.startsWith(`${bookUrl}#`)) {
      sessionFailCount.delete(key);
    }
  }
}

/** 预下载设置变更后：取消进行中的任务并按新配置重新调度 */
export function restartChapterBodyCachePrefetch(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): void {
  if (book.origin === 'local' || book.origin?.startsWith('local::')) return;
  clearPrefetchSessionState(book.bookUrl);
  scheduleChapterBodyCachePrefetch(book, catalog, currentIndex);
}

export function onChapterPrefetchSettingsSaved(): void {
  notifyChapterPrefetchSettingsChange();
}

function taskKey(bookUrl: string, index: number): string {
  return `${bookUrl}#${index}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachBookUrlToCatalog(
  bookUrl: string,
  catalog: BookChapter[],
): BookChapter[] {
  if (!bookUrl) return catalog;
  let changed = false;
  const next = catalog.map((chapter) => {
    if (chapter.bookUrl === bookUrl) return chapter;
    changed = true;
    return { ...chapter, bookUrl };
  });
  return changed ? next : catalog;
}

/**
 * 阅读时后台缓存目标章索引（向前 / 向后独立配置，Set 去重）。
 *
 * - 向前：current+1 .. current+forwardPrefetchNum
 * - 向后（n≥2）：current-2 .. current-min(5,n)（对齐 Legado）
 * - 向后（n=1）：仅 current-1
 */
export function collectPrefetchIndices(
  currentIndex: number,
  catalogLength: number,
  settings: ChapterCacheSettings,
): number[] {
  const indices = new Set<number>();
  if (catalogLength <= 0) return [];

  const forwardN = settings.forwardPrefetchNum;
  if (forwardN > 0) {
    for (let d = 1; d <= forwardN; d++) {
      const next = currentIndex + d;
      if (next < catalogLength) indices.add(next);
    }
  }

  const backN = settings.backwardPrefetchNum;
  if (backN >= 2) {
    const minIndex = Math.max(0, currentIndex - Math.min(5, backN));
    for (let i = currentIndex - 2; i >= minIndex; i--) {
      indices.add(i);
    }
  } else if (backN === 1) {
    const prev = currentIndex - 1;
    if (prev >= 0) indices.add(prev);
  }

  return [...indices].sort((a, b) => a - b);
}

async function shouldSkipPrefetchTarget(
  bookUrl: string,
  index: number,
  chapter: BookChapter | undefined,
): Promise<boolean> {
  if (chapter?.isVolume) return true;

  const key = taskKey(bookUrl, index);
  if (inflight.has(key)) return true;
  if (sessionDone.has(key)) return true;
  if ((sessionFailCount.get(key) ?? 0) >= MAX_FAIL_RETRIES) return true;

  const existing = await readCachedChapterRaw(bookUrl, index);
  if (existing?.trim()) {
    sessionDone.add(key);
    return true;
  }
  return false;
}

async function prefetchOne(
  session: PrefetchSession,
  index: number,
): Promise<void> {
  const key = taskKey(session.bookUrl, index);
  if (inflight.has(key)) return;
  // 对齐 Max：下一页懒加载书源不走后台预取整链
  if (session.source.nextPageLazyLoad) return;
  inflight.add(key);

  try {
    await delay(PREFETCH_DELAY_MS);
    if (session.cancelled) return;

    const chapter = session.catalog[index];
    if (await shouldSkipPrefetchTarget(session.bookUrl, index, chapter)) {
      return;
    }

    const nextChapter = session.catalog[index + 1];
    const raw = await fetchAndCacheChapterContent(
      session.source,
      session.book,
      chapter!,
      nextChapter?.url,
      { cacheIndex: index, skipLazyContinuation: true },
    );
    if (raw?.trim()) {
      sessionDone.add(key);
      sessionFailCount.delete(key);
    }
  } catch (e) {
    const fails = (sessionFailCount.get(key) ?? 0) + 1;
    sessionFailCount.set(key, fails);
    console.warn('[chapter-cache] prefetch failed', index, e);
  } finally {
    inflight.delete(key);
  }
}

async function pumpSession(bookUrl: string): Promise<void> {
  if (pumping.has(bookUrl)) return;
  pumping.add(bookUrl);
  try {
    while (true) {
      const session = sessions.get(bookUrl);
      if (!session || session.cancelled) break;

      while (session.cursor < session.targets.length) {
        if (session.cancelled) break;
        if (inflight.size >= MAX_PREFETCH_INFLIGHT) {
          await delay(200);
          continue;
        }
        const index = session.targets[session.cursor]!;
        session.cursor += 1;
        void prefetchOne(session, index);
      }

      if (session.cursor >= session.targets.length) {
        if (inflight.size === 0) break;
        await delay(200);
        continue;
      }
      await delay(200);
    }
  } finally {
    pumping.delete(bookUrl);
  }
}

function startPrefetchSession(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
  source: BookSource,
  targets: number[],
): void {
  const bookUrl = book.bookUrl;
  const existing = sessions.get(bookUrl);
  if (existing) {
    existing.cancelled = true;
  }

  const session: PrefetchSession = {
    bookUrl,
    book,
    catalog: normalizeCatalogChapterIndices(
      attachBookUrlToCatalog(bookUrl, catalog),
    ),
    currentIndex,
    source,
    targets,
    cursor: 0,
    cancelled: false,
  };
  sessions.set(bookUrl, session);
  void pumpSession(bookUrl);
}

export function cancelPrefetchOnRead(bookUrl: string): void {
  const session = sessions.get(bookUrl);
  if (session) {
    session.cancelled = true;
    sessions.delete(bookUrl);
  }
}

/**
 * 阅读切章后后台缓存：向前 + 向后预下载（合并去重）
 */
export async function prefetchChaptersOnRead(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): Promise<void> {
  if (book.origin === 'local' || book.origin?.startsWith('local::')) return;
  if (!book.origin || !book.bookUrl) return;

  const settings = await getChapterCacheSettings();
  const targets = collectPrefetchIndices(
    currentIndex,
    catalog.length,
    settings,
  );
  if (targets.length === 0) return;

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) return;
  if (isInnerWebAwaiting()) return;

  startPrefetchSession(book, catalog, currentIndex, source, targets);
}

/** 正文就绪后触发缓存预取（不阻塞阅读） */
export function scheduleChapterBodyCachePrefetch(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): void {
  if (book.origin === 'local' || book.origin?.startsWith('local::')) return;
  void prefetchChaptersOnRead(book, catalog, currentIndex).catch((e) => {
    console.warn('[chapter-cache] schedule prefetch failed', e);
  });
}
