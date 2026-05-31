/**
 * 按 bookUrl 全局复用封面 blob：虚拟列表 remount 不重复 load/peek/读盘。
 */

import { createStore } from 'solid-js/store';
import {
  isCoverImageLoadBlocked,
  loadCoverImageObjectUrl,
  peekCoverImageObjectUrl,
  type CoverImageLoadOptions,
  type CoverImagePeekOptions,
} from '@/lib/http/cover-image-loader';
import { clearIdleCoverQueue, enqueueIdleCoverTask } from '@/lib/http/cover-idle-preload';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';

function coverResourceKey(url: string): string {
  const n = normalizeImageUrl(url);
  if (!n || !/^https?:\/\//i.test(n)) return n;
  try {
    const u = new URL(n);
    return `${u.origin}${u.pathname}`;
  } catch {
    return n;
  }
}
export type CoverSessionStatus = 'idle' | 'loading' | 'ok' | 'fail';

export type CoverSessionEntry = {
  norm: string;
  blob: string | null;
  status: CoverSessionStatus;
};

const [coverSession, setCoverSession] = createStore<Record<string, CoverSessionEntry>>({});

const inflightByBook = new Map<string, Promise<void>>();
const pendingLoadBooks = new Set<string>();

function peekOptions(
  _norm: string,
  opts: CoverImagePeekOptions,
): CoverImagePeekOptions {
  return { referer: opts.referer, source: opts.source, bookUrl: opts.bookUrl };
}

/** 同步：L1 / 会话 store，供渲染 */
export function getCoverSessionBlob(
  bookUrl: string | null | undefined,
  norm: string,
  opts: CoverImagePeekOptions,
): string | null {
  const book = bookUrl?.trim();
  if (!book || !norm) return null;

  const peeked = peekCoverImageObjectUrl(norm, peekOptions(norm, opts));
  if (peeked) return peeked;

  const entry = coverSession[book];
  if (entry?.norm === norm && entry.status === 'ok' && entry.blob) {
    return entry.blob;
  }
  return null;
}

/** 订阅 coverSession store + L1，load 完成后 UI 自动更新 */
export function readCoverSessionBlobReactive(
  bookUrl: string | null | undefined,
  norm: string,
  opts: CoverImagePeekOptions,
): string | null {
  const book = bookUrl?.trim();
  if (!book || !norm) return null;
  const entry = coverSession[book];
  if (entry?.norm === norm && entry.blob) {
    return entry.blob;
  }
  return getCoverSessionBlob(book, norm, opts);
}

export function getCoverSessionStatus(
  bookUrl: string | null | undefined,
): CoverSessionStatus | undefined {
  const book = bookUrl?.trim();
  if (!book) return undefined;
  return coverSession[book]?.status;
}

/**
 * 在空闲且允许加载时发起一次按 bookUrl 去重的 load；已 ok/fail/loading 同 norm 则跳过。
 */
export function scheduleCoverSessionLoad(
  bookUrl: string | null | undefined,
  norm: string,
  opts: CoverImageLoadOptions,
  canLoad: boolean,
): void {
  const book = bookUrl?.trim();
  if (!book || !norm || !canLoad) return;

  const peeked = peekCoverImageObjectUrl(norm, peekOptions(norm, opts));
  if (peeked) {
    if (coverSession[book]?.blob !== peeked || coverSession[book]?.norm !== norm) {
      setCoverSession(book, { norm, blob: peeked, status: 'ok' });
    }
    return;
  }

  const cur = coverSession[book];
  if (cur?.norm === norm) {
    if (cur.status === 'ok' || cur.status === 'loading') return;
    if (cur.status === 'fail') return;
  }
  if (
    cur?.status === 'ok' &&
    cur.blob &&
    coverResourceKey(cur.norm) === coverResourceKey(norm)
  ) {
    if (cur.norm !== norm) {
      setCoverSession(book, { norm, blob: cur.blob, status: 'ok' });
    }
    return;
  }

  if (isCoverImageLoadBlocked(book, norm, opts.source ?? null)) {
    setCoverSession(book, { norm, blob: null, status: 'fail' });
    return;
  }

  if (inflightByBook.has(book) || pendingLoadBooks.has(book)) return;

  pendingLoadBooks.add(book);

  const startLoad = () => {
    pendingLoadBooks.delete(book);
    if (inflightByBook.has(book)) return;
    const latest = coverSession[book];
    if (latest?.norm === norm && (latest.status === 'ok' || latest.status === 'loading')) {
      return;
    }

    setCoverSession(book, {
      norm,
      blob: latest?.blob && latest.norm === norm ? latest.blob : null,
      status: 'loading',
    });

    const run = loadCoverImageObjectUrl(norm, {
      referer: opts.referer,
      source: opts.source,
      bookUrl: book,
      onCoverUrlRefreshed: opts.onCoverUrlRefreshed,
      skipDiskRead: opts.skipDiskRead,
    })
      .then((blob) => {
        const cur = coverSession[book];
        if (cur?.norm !== norm) return;
        setCoverSession(book, {
          norm,
          blob,
          status: blob ? 'ok' : 'fail',
        });
      })
      .catch(() => {
        setCoverSession(book, { norm, blob: null, status: 'fail' });
      })
      .finally(() => {
        inflightByBook.delete(book);
      });

    inflightByBook.set(book, run);
  };

  enqueueIdleCoverTask(startLoad);
}

export function clearCoverSession(): void {
  setCoverSession({});
  inflightByBook.clear();
  pendingLoadBooks.clear();
  clearIdleCoverQueue();
}

/** 切换分类时可选：保留 disk-absent 在 loader 内，仅清 session */
