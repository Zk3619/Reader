/**
 * 正文/漫画插图网络拉取并发池，对齐 Legado ReadConstants.PRE_DOWNLOAD_CONCURRENCY（2～3）。
 * 避免一章数十张图同时 download_binary 导致 CDN/书源限流或 Tauri 连接耗尽。
 */

/** 与 Legado PRE_DOWNLOAD_CONCURRENCY 同量级 */
export const READER_INLINE_IMAGE_FETCH_CONCURRENCY = 3;

let active = 0;
const waiters: Array<() => void> = [];

function drain(): void {
  while (active < READER_INLINE_IMAGE_FETCH_CONCURRENCY && waiters.length > 0) {
    active++;
    const next = waiters.shift();
    next?.();
  }
}

function acquireSlot(): Promise<void> {
  if (active < READER_INLINE_IMAGE_FETCH_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  drain();
}

/** 在并发池内执行一次插图 HTTP 拉取 */
export async function withReaderInlineImageFetchSlot<T>(
  fn: () => Promise<T>,
): Promise<T> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}
