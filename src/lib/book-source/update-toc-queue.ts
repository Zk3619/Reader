/**
 * 书架批量更新目录队列（对应 Legado MainViewModel.upToc / startUpTocJob）
 */

import * as booksDb from '@/lib/database/books';
import { updateBookToc } from '@/lib/book-source/update-toc';

const DEFAULT_CONCURRENCY = 3;

export interface UpdateTocQueueCallbacks {
  /** 单本书更新结束（成功或失败） */
  onBookDone?: (bookUrl: string, error: Error | null) => void;
  /** 全部任务结束 */
  onAllDone?: (result: UpdateTocBatchResult) => void;
  /** 队列长度变化 */
  onProgress?: (pending: number, active: number) => void;
}

export interface UpdateTocBatchResult {
  total: number;
  success: number;
  failed: number;
}

const waitQueue: string[] = [];
const activeSet = new Set<string>();
let running = 0;
let batchTotal = 0;
let batchSuccess = 0;
let batchFailed = 0;
let callbacks: UpdateTocQueueCallbacks = {};

/** 按书源串行（Legado 每书源 Semaphore(1)） */
const sourceTail = new Map<string, Promise<void>>();

function notifyProgress(): void {
  callbacks.onProgress?.(waitQueue.length, activeSet.size);
}

function enqueueSourceTask(sourceUrl: string, task: () => Promise<void>): Promise<void> {
  const prev = sourceTail.get(sourceUrl) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(task);
  sourceTail.set(
    sourceUrl,
    next.finally(() => {
      if (sourceTail.get(sourceUrl) === next) {
        sourceTail.delete(sourceUrl);
      }
    }),
  );
  return next;
}

async function runOne(bookUrl: string): Promise<void> {
  activeSet.add(bookUrl);
  notifyProgress();
  let error: Error | null = null;
  try {
    const book = await booksDb.getBook(bookUrl);
    const sourceUrl = book?.origin ?? '';
    if (sourceUrl) {
      await enqueueSourceTask(sourceUrl, () => updateBookToc(bookUrl));
    } else {
      await updateBookToc(bookUrl);
    }
    batchSuccess += 1;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    batchFailed += 1;
    console.warn('[update-toc]', bookUrl, error.message);
  } finally {
    activeSet.delete(bookUrl);
    notifyProgress();
    callbacks.onBookDone?.(bookUrl, error);
    running -= 1;
    pump();
    if (running === 0 && waitQueue.length === 0 && activeSet.size === 0) {
      const result = {
        total: batchTotal,
        success: batchSuccess,
        failed: batchFailed,
      };
      batchTotal = 0;
      batchSuccess = 0;
      batchFailed = 0;
      callbacks.onAllDone?.(result);
    }
  }
}

function pump(): void {
  while (running < DEFAULT_CONCURRENCY && waitQueue.length > 0) {
    const bookUrl = waitQueue.shift();
    if (!bookUrl || activeSet.has(bookUrl)) continue;
    running += 1;
    void runOne(bookUrl);
  }
}

/**
 * 将书籍加入更新队列（已排队或正在更新的书不会重复加入）
 */
export function enqueueUpdateToc(
  bookUrls: string[],
  cb: UpdateTocQueueCallbacks = {},
): void {
  callbacks = cb;
  let added = 0;
  for (const url of bookUrls) {
    if (!url || activeSet.has(url) || waitQueue.includes(url)) continue;
    waitQueue.push(url);
    added += 1;
  }
  if (added === 0 && running === 0 && activeSet.size === 0) {
    cb.onAllDone?.({ total: 0, success: 0, failed: 0 });
    return;
  }
  if (batchTotal === 0 && running === 0 && activeSet.size === 0) {
    batchTotal = waitQueue.length;
    batchSuccess = 0;
    batchFailed = 0;
  } else {
    batchTotal += added;
  }
  notifyProgress();
  pump();
}

export function isBookTocUpdating(bookUrl: string): boolean {
  return activeSet.has(bookUrl) || waitQueue.includes(bookUrl);
}

export function getUpdateTocQueueSize(): { pending: number; active: number } {
  return { pending: waitQueue.length, active: activeSet.size };
}

export function isUpdateTocRunning(): boolean {
  return running > 0 || waitQueue.length > 0 || activeSet.size > 0;
}
