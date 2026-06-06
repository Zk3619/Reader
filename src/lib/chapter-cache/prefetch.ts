/**
 * 阅读时章节缓存预取（相邻章 + 预下载合并去重）
 * 对齐 Legado ReadBook.preDownload：信号量并发 + 队列续跑 + 失败重试
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
 * 合并相邻预取与 Legado 预下载目标，避免同一章重复入队。
 *
 * Legado ReadBook.preDownload：
 * - 向前：current+2 .. current+preDownloadNum（±1 由 loadTextChapter 即时加载）
 * - 向后：current-2 .. current-min(5, preDownloadNum)
 */
export function collectPrefetchIndices(
  currentIndex: number,
  catalogLength: number,
  settings: ChapterCacheSettings,
): number[] {
  const indices = new Set<number>();
  if (catalogLength <= 0) return [];

  if (settings.prefetchEnabled) {
    for (let d = 1; d <= settings.prefetchCount; d++) {
      const next = currentIndex + d;
      const prev = currentIndex - d;
      if (next < catalogLength) indices.add(next);
      if (prev >= 0) indices.add(prev);
    }
  }

  const n = settings.preDownloadNum;
  if (n >= 2) {
    const maxIndex = Math.min(currentIndex + n, catalogLength - 1);
    for (let i = currentIndex + 2; i <= maxIndex; i++) {
      indices.add(i);
    }
    const minIndex = Math.max(0, currentIndex - Math.min(5, n));
    for (let i = currentIndex - 2; i >= minIndex; i--) {
      indices.add(i);
    }
  } else if (n === 1) {
    const next = currentIndex + 1;
    if (next < catalogLength) indices.add(next);
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

async function pumpPrefetch(bookUrl: string): Promise<void> {
  if (pumping.has(bookUrl)) return;
  pumping.add(bookUrl);

  try {
    const session = sessions.get(bookUrl);
    if (!session || session.cancelled) return;

    while (inflight.size < MAX_PREFETCH_INFLIGHT) {
      let nextIndex: number | null = null;

      while (session.cursor < session.targets.length) {
        const index = session.targets[session.cursor];
        session.cursor += 1;
        const chapter = session.catalog[index];
        if (await shouldSkipPrefetchTarget(bookUrl, index, chapter)) continue;
        nextIndex = index;
        break;
      }

      if (nextIndex === null) break;

      const key = taskKey(bookUrl, nextIndex);
      inflight.add(key);
      void runPrefetchTask(session, nextIndex, key);
    }
  } finally {
    pumping.delete(bookUrl);
  }
}

async function runPrefetchTask(
  session: PrefetchSession,
  index: number,
  key: string,
): Promise<void> {
  try {
    await delay(PREFETCH_DELAY_MS);
    if (session.cancelled) return;

    const chapter = session.catalog[index];
    if (!chapter || chapter.isVolume) return;

    const next = session.catalog[index + 1];
    const raw = await fetchAndCacheChapterContent(
      session.source,
      session.book,
      chapter,
      next?.url,
      index,
    );
    if (raw?.trim()) {
      sessionDone.add(key);
    }
  } catch (e) {
    console.warn('[chapter-cache] prefetch failed', index, e);
    sessionFailCount.set(key, (sessionFailCount.get(key) ?? 0) + 1);
  } finally {
    inflight.delete(key);
    const active = sessions.get(session.bookUrl);
    if (active && !active.cancelled) {
      void pumpPrefetch(session.bookUrl);
    }
  }
}

function startPrefetchSession(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
  source: BookSource,
  targets: number[],
): void {
  const normalized = attachBookUrlToCatalog(
    book.bookUrl,
    normalizeCatalogChapterIndices(catalog),
  );

  const prev = sessions.get(book.bookUrl);
  if (prev?.currentIndex === currentIndex && !prev.cancelled) {
    const sameTargets =
      prev.targets.length === targets.length &&
      prev.targets.every((v, i) => v === targets[i]);
    if (sameTargets && prev.cursor < prev.targets.length) {
      void pumpPrefetch(book.bookUrl);
      return;
    }
  }
  if (prev) prev.cancelled = true;

  const session: PrefetchSession = {
    bookUrl: book.bookUrl,
    book,
    catalog: normalized,
    currentIndex,
    source,
    targets,
    cursor: 0,
    cancelled: false,
  };
  sessions.set(book.bookUrl, session);
  void pumpPrefetch(book.bookUrl);
}

/** 离开阅读页时取消预下载（对齐 Legado cancelPreDownloadTask） */
export function cancelPrefetchOnRead(bookUrl?: string): void {
  if (bookUrl) {
    const session = sessions.get(bookUrl);
    if (session) session.cancelled = true;
    sessions.delete(bookUrl);
    return;
  }
  for (const session of sessions.values()) {
    session.cancelled = true;
  }
  sessions.clear();
}

/**
 * 阅读切章后后台缓存：前后相邻（可选）+ Legado 式预下载
 * 按设置页「章节正文缓存」配置执行，与排版预热无关。
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
  // 内嵌页 await 进行中时不并发预取；正文 rule 含 startBrowserAwait 时由 getContent 非阻塞处理
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
