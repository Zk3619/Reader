/**
 * 书架批量更新目录队列（对应 Legado MainViewModel.upToc / startUpTocJob）
 */

import { createStore } from 'solid-js/store';
import * as booksDb from '@/lib/database/books';
import { updateBookToc } from '@/lib/book-source/update-toc';

const DEFAULT_CONCURRENCY = 3;

export interface UpdateTocQueueCallbacks {
  /** 单本书更新结束（成功或失败）；requestedUrl 为入队时的 URL */
  onBookDone?: (
    bookUrl: string,
    error: Error | null,
    requestedUrl?: string,
  ) => void;
  /** 全部任务结束 */
  onAllDone?: (result: UpdateTocBatchResult) => void;
  /** 队列进度变化 */
  onProgress?: (progress: UpdateTocQueueProgress) => void;
}

export interface UpdateTocQueueProgress {
  pending: number;
  active: number;
  done: number;
  total: number;
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

const [queueState, setQueueState] = createStore({
  pending: 0,
  active: 0,
});

/** 等待 + 正在更新的书本数（Solid 响应式） */
export const updateTocQueueStore = {
  get state() {
    return queueState;
  },
  get totalCount() {
    return queueState.pending + queueState.active;
  },
};

/** 按书源串行（Legado 每书源 Semaphore(1)） */
const sourceTail = new Map<string, Promise<void>>();

function notifyProgress(): void {
  setQueueState({
    pending: waitQueue.length,
    active: activeSet.size,
  });
  callbacks.onProgress?.({
    pending: waitQueue.length,
    active: activeSet.size,
    done: batchSuccess + batchFailed,
    total: batchTotal,
  });
}

function enqueueSourceTask(sourceUrl: string, task: () => Promise<string>): Promise<string> {
  const prev = sourceTail.get(sourceUrl) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  sourceTail.set(
    sourceUrl,
    tail.finally(() => {
      if (sourceTail.get(sourceUrl) === tail) {
        sourceTail.delete(sourceUrl);
      }
    }),
  );
  return next;
}

async function runOne(bookUrl: string): Promise<void> {
  const requestedUrl = bookUrl;
  activeSet.add(requestedUrl);
  notifyProgress();
  let error: Error | null = null;
  let resultUrl = requestedUrl;
  try {
    const book = await booksDb.getBook(requestedUrl);
    const sourceUrl = book?.origin ?? '';
    if (sourceUrl) {
      resultUrl = await enqueueSourceTask(sourceUrl, () => updateBookToc(requestedUrl));
    } else {
      resultUrl = await updateBookToc(requestedUrl);
    }
    batchSuccess += 1;
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    batchFailed += 1;
    console.warn('[update-toc]', requestedUrl, error.message);
  } finally {
    activeSet.delete(requestedUrl);
    notifyProgress();
    callbacks.onBookDone?.(resultUrl, error, requestedUrl);
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
