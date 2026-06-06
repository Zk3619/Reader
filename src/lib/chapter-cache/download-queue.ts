/**
 * 批量缓存章节队列（对齐 Legado CacheBook）
 */

import { createStore } from 'solid-js/store';
import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import {
  fetchAndCacheChapterContent,
  readCachedChapterRaw,
} from '@/lib/chapter-cache/storage';
import { showAppToast } from '@/components/shared/AppToasts';
import type { Book } from '@/types';

const DEFAULT_CONCURRENCY = 2;
const MAX_RETRIES = 3;

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

  const stats = `共 ${result.totalChapters} 章，已缓存 ${result.cached} 章${
    result.failed > 0 ? `，失败 ${result.failed} 章` : ''
  }`;

  showAppToast({
    title: `离线缓存完成 · 《${name}》`,
    description: stats,
    variant: result.failed > 0 ? 'warning' : 'success',
  });

  window.dispatchEvent(
    new CustomEvent('chapter-cache-updated', { detail: { bookUrl: job.bookUrl } }),
  );
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

    const existing = await readCachedChapterRaw(book.bookUrl, index);
    if (existing?.trim()) {
      done += 1;
      cached += 1;
      setBookProgress(job.bookUrl, { done });
      continue;
    }

    let ok = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !ok; attempt++) {
      if (job.abort.signal.aborted) break;
      try {
        const next = chapters[index + 1];
        const raw = await fetchAndCacheChapterContent(
          source,
          book,
          chapter,
          next?.url,
          index,
        );
        if (raw?.trim()) {
          ok = true;
          cached += 1;
        }
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) {
          failed += 1;
          setBookProgress(job.bookUrl, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
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
