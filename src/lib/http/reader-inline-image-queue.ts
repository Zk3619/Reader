/**
 * 正文/漫画插图网络拉取并发池，对齐 Legado ReadConstants.PRE_DOWNLOAD_CONCURRENCY（2～3）。
 * 高优先级（可见页）优先于低优先级（章内预取），避免预取挤占首屏。
 */

/** 与 Legado PRE_DOWNLOAD_CONCURRENCY 同量级 */
export const READER_INLINE_IMAGE_FETCH_CONCURRENCY = 3;

export type ReaderInlineImageFetchPriority = 'high' | 'low';

let active = 0;
const highWaiters: Array<() => void> = [];
const lowWaiters: Array<() => void> = [];

function drain(): void {
  while (active < READER_INLINE_IMAGE_FETCH_CONCURRENCY) {
    const next = highWaiters.shift() ?? lowWaiters.shift();
    if (!next) break;
    active++;
    next();
  }
}

function acquireSlot(priority: ReaderInlineImageFetchPriority): Promise<void> {
  if (active < READER_INLINE_IMAGE_FETCH_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (priority === 'high') {
      highWaiters.push(resolve);
    } else {
      lowWaiters.push(resolve);
    }
  });
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  drain();
}

/** 在并发池内执行一次插图 HTTP 拉取；可见页用 high，章内预取用 low */
export async function withReaderInlineImageFetchSlot<T>(
  fn: () => Promise<T>,
  priority: ReaderInlineImageFetchPriority = 'high',
): Promise<T> {
  await acquireSlot(priority);
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}
