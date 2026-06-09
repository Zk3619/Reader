/**
 * 批量缓存章节队列（对齐 Legado CacheBook）
 * 图片章：HTML 落盘后需等待插图全部拉取完成，才计为该章缓存完成。
 * 听书章：HTML 落盘后需等待音频段全部落盘，才计为该章缓存完成。
 */

import { createStore } from 'solid-js/store';
import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import { CHAPTER_CACHE_TIER_MANUAL } from '@/lib/chapter-cache/cache-tier';
import {
  fetchAndCacheChapterContent,
  promoteChapterCacheToManual,
  readCachedChapterRaw,
} from '@/lib/chapter-cache/storage';
import { isAudioChapterContent } from '@/lib/media/audio/audio-book-detect';
import {
  isAudioChapterTracksCompleteOnDisk,
  warmAudioForCachedChapter,
} from '@/lib/export/export-audio';
import { isMangaChapterContent } from '@/lib/media/image/image-book-detect';
import {
  listFetchableMangaImageRefs,
  warmMangaImagesForCachedChapter,
} from '@/lib/export/export-images';
import { readMangaImageFromDisk } from '@/lib/media/image/image-disk-cache';
import { showAppToast } from '@/components/shared/AppToasts';
import type { Book, BookChapter, BookSource } from '@/types';

const DEFAULT_CONCURRENCY = 2;
const MAX_RETRIES = 3;
const MEDIA_WARM_RETRY_DELAY_MS = 600;

export interface ChapterDownloadProgress {
  bookUrl: string;
  done: number;
  total: number;
  currentIndex: number | null;
  error: string | null;
}

export interface ChapterDownloadBatchResult {
  totalChapters: number;
  cached: number;
  failed: number;
  cancelled: boolean;
}

type BookJob = {
  bookUrl: string;
  start: number;
  end: number;
  abort: AbortController;
};

const waitQueue: BookJob[] = [];
const activeJobs = new Map<string, BookJob>();
let running = 0;

const [queueState, setQueueState] = createStore({
  activeBookUrls: [] as string[],
  progressByBook: {} as Record<string, ChapterDownloadProgress>,
});

export const chapterCacheDownloadStore = {
  get state() {
    return queueState;
  },
  isBookActive(bookUrl: string): boolean {
    return queueState.activeBookUrls.includes(bookUrl);
  },
  getProgress(bookUrl: string): ChapterDownloadProgress | undefined {
    return queueState.progressByBook[bookUrl];
  },
};

function syncActiveUrls(): void {
  const urls = [
    ...activeJobs.keys(),
    ...waitQueue.map((j) => j.bookUrl),
  ];
  setQueueState('activeBookUrls', [...new Set(urls)]);
}

function setBookProgress(bookUrl: string, patch: Partial<ChapterDownloadProgress>): void {
  const prev = queueState.progressByBook[bookUrl] ?? {
    bookUrl,
    done: 0,
    total: 0,
    currentIndex: null,
    error: null,
  };
  setQueueState('progressByBook', bookUrl, { ...prev, ...patch });
}

function notifyChapterCacheUpdated(bookUrl: string): void {
  window.dispatchEvent(
    new CustomEvent('chapter-cache-updated', { detail: { bookUrl } }),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stopChapterDownload(bookUrl: string): void {
  const active = activeJobs.get(bookUrl);
  if (active) {
    active.abort.abort();
    activeJobs.delete(bookUrl);
    running = Math.max(0, running - 1);
  }
  const idx = waitQueue.findIndex((j) => j.bookUrl === bookUrl);
  if (idx >= 0) waitQueue.splice(idx, 1);
  syncActiveUrls();
  pump();
}

export function stopAllChapterDownloads(): void {
  for (const job of activeJobs.values()) {
    job.abort.abort();
  }
  activeJobs.clear();
  waitQueue.length = 0;
  running = 0;
  syncActiveUrls();
}

export function enqueueChapterDownload(
  bookUrl: string,
  startIndex: number,
  endIndex: number,
): void {
  stopChapterDownload(bookUrl);
  const job: BookJob = {
    bookUrl,
    start: startIndex,
    end: endIndex,
    abort: new AbortController(),
  };
  waitQueue.push(job);
  setBookProgress(bookUrl, {
    bookUrl,
    done: 0,
    total: Math.max(0, endIndex - startIndex + 1),
    currentIndex: null,
    error: null,
  });
  syncActiveUrls();
  pump();
}

function hasBookDownloadPending(bookUrl: string): boolean {
  return (
    activeJobs.has(bookUrl) || waitQueue.some((j) => j.bookUrl === bookUrl)
  );
}

async function notifyBookDownloadFinished(
  job: BookJob,
  result: ChapterDownloadBatchResult,
): Promise<void> {
  if (result.cancelled || hasBookDownloadPending(job.bookUrl)) return;

  const book = await booksDb.getBook(job.bookUrl);
  const name = book?.name ?? '本书';

  if (result.totalChapters === 0) {
    const err = queueState.progressByBook[job.bookUrl]?.error;
    if (err) {
      showAppToast({
        title: `离线缓存失败 · 《${name}》`,
        description: err,
        variant: 'destructive',
      });
    }
    return;
  }

  const stats = `共 ${result.totalChapters} 章，已缓存 ${result.cached} 章${result.failed > 0 ? `，失败 ${result.failed} 章` : ''
    }`;

  showAppToast({
    title: `离线缓存完成 · 《${name}》`,
    description: stats,
    variant: result.failed > 0 ? 'warning' : 'success',
  });

  notifyChapterCacheUpdated(job.bookUrl);
}

function pump(): void {
  while (running < DEFAULT_CONCURRENCY && waitQueue.length > 0) {
    const job = waitQueue.shift();
    if (!job) break;
    activeJobs.set(job.bookUrl, job);
    running += 1;
    syncActiveUrls();
    void runBookJob(job)
      .then((result) => notifyBookDownloadFinished(job, result))
      .finally(() => {
        activeJobs.delete(job.bookUrl);
        running = Math.max(0, running - 1);
        syncActiveUrls();
        pump();
      });
  }
}

async function warmMangaChapterWithRetry(
  book: Book,
  chapterIndex: number,
  raw: string,
  chapterUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal.aborted) return false;
    const result = await warmMangaImagesForCachedChapter(
      book,
      chapterIndex,
      raw,
      chapterUrl,
    );
    if (result.complete) return true;
    if (attempt < MAX_RETRIES - 1) {
      await delay(MEDIA_WARM_RETRY_DELAY_MS);
    }
  }
  return false;
}

async function warmAudioChapterWithRetry(
  book: Book,
  chapterIndex: number,
  raw: string,
  chapter: BookChapter,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal.aborted) return false;
    const result = await warmAudioForCachedChapter(
      book,
      chapterIndex,
      raw,
      chapter,
    );
    if (result.complete) return true;
    if (attempt < MAX_RETRIES - 1) {
      await delay(MEDIA_WARM_RETRY_DELAY_MS);
    }
  }
  return false;
}

/** 仅检查磁盘是否已有全部需拉取的图片（不触发网络） */
async function isMangaChapterImagesCompleteOnDisk(
  book: Book,
  raw: string,
  chapterUrl: string,
): Promise<boolean> {
  const fetchable = listFetchableMangaImageRefs(raw, chapterUrl);
  if (fetchable.length === 0) return true;
  const source = await sourcesDb.getSource(book.origin);
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  let onDisk = 0;
  for (const ref of fetchable) {
    if (await readMangaImageFromDisk(ref.url, sourceId)) onDisk += 1;
  }
  return onDisk >= fetchable.length;
}

async function isChapterMediaCompleteOnDisk(
  book: Book,
  raw: string,
  chapterUrl: string,
  chapterIndex: number,
): Promise<boolean> {
  if (isMangaChapterContent(raw, chapterUrl)) {
    return isMangaChapterImagesCompleteOnDisk(book, raw, chapterUrl);
  }
  if (isAudioChapterContent(raw)) {
    return isAudioChapterTracksCompleteOnDisk(book, raw, chapterIndex);
  }
  return true;
}

async function ensureChapterFullyCached(
  book: Book,
  source: BookSource,
  chapter: BookChapter,
  index: number,
  nextChapterUrl: string | undefined,
  job: BookJob,
): Promise<boolean> {
  const chapterUrl = chapter.url ?? chapter.baseUrl ?? '';

  if (await chapterCacheDb.isManualCachedChapter(book.bookUrl, index)) {
    const existingRaw = await readCachedChapterRaw(book.bookUrl, index);
    if (existingRaw?.trim()) {
      const complete = await isChapterMediaCompleteOnDisk(
        book,
        existingRaw,
        chapterUrl,
        index,
      );
      if (complete) return true;
    }
  }

  let raw = await readCachedChapterRaw(book.bookUrl, index);

  if (!raw?.trim()) {
    let fetched: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (job.abort.signal.aborted) return false;
      try {
        fetched = await fetchAndCacheChapterContent(
          source,
          book,
          chapter,
          nextChapterUrl,
          { cacheIndex: index, cacheTier: CHAPTER_CACHE_TIER_MANUAL },
        );
        if (fetched?.trim()) break;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) {
          setBookProgress(job.bookUrl, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    raw = fetched;
    if (!raw?.trim()) return false;
  }

  let ok = true;
  if (isMangaChapterContent(raw, chapterUrl)) {
    ok = await warmMangaChapterWithRetry(
      book,
      index,
      raw,
      chapterUrl,
      job.abort.signal,
    );
    if (!ok) {
      setBookProgress(job.bookUrl, {
        error: `第 ${index + 1} 章图片未全部缓存成功`,
      });
    }
  } else if (isAudioChapterContent(raw)) {
    ok = await warmAudioChapterWithRetry(
      book,
      index,
      raw,
      chapter,
      job.abort.signal,
    );
    if (!ok) {
      setBookProgress(job.bookUrl, {
        error: `第 ${index + 1} 章音频未全部缓存成功`,
      });
    }
  }

  if (ok) {
    await promoteChapterCacheToManual(book.bookUrl, index);
  }
  return ok;
}

async function runBookJob(job: BookJob): Promise<ChapterDownloadBatchResult> {
  const book = await booksDb.getBook(job.bookUrl);
  if (!book || isLocalBook(book)) {
    return { totalChapters: 0, cached: 0, failed: 0, cancelled: job.abort.signal.aborted };
  }

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) {
    setBookProgress(job.bookUrl, { error: '书源不存在或已禁用' });
    return { totalChapters: 0, cached: 0, failed: 0, cancelled: false };
  }

  const chapters = await chaptersDb.getChapterList(book.bookUrl);
  const start = Math.max(0, job.start);
  const end = Math.min(chapters.length - 1, job.end);
  const total = Math.max(0, end - start + 1);
  let done = 0;
  let failed = 0;
  let cached = 0;

  setBookProgress(job.bookUrl, { total, done: 0, currentIndex: null, error: null });

  for (let index = start; index <= end; index++) {
    if (job.abort.signal.aborted) break;

    const chapter = chapters[index];
    if (!chapter) continue;

    setBookProgress(job.bookUrl, { currentIndex: index });

    const next = chapters[index + 1];
    const ok = await ensureChapterFullyCached(
      book,
      source,
      chapter,
      index,
      next?.url,
      job,
    );

    if (ok) {
      cached += 1;
      notifyChapterCacheUpdated(job.bookUrl);
    } else if (!job.abort.signal.aborted) {
      failed += 1;
    }

    done += 1;
    setBookProgress(job.bookUrl, { done });
  }

  return {
    totalChapters: total,
    cached,
    failed,
    cancelled: job.abort.signal.aborted,
  };
}

/** 从当前阅读章节缓存到末章 */
export function enqueueDownloadFromCurrent(book: Book): void {
  const start = book.durChapterIndex ?? 0;
  const total = book.totalChapterNum ?? 0;
  const end = total > 0 ? total - 1 : start;
  enqueueChapterDownload(book.bookUrl, start, end);
}

/** 缓存全书 */
export function enqueueDownloadAll(book: Book): void {
  const end = Math.max(0, (book.totalChapterNum ?? 1) - 1);
  enqueueChapterDownload(book.bookUrl, 0, end);
}
