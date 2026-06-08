/**
 * 阅读器离线缓存弹窗共用逻辑（章节范围、队列启停）
 */

import { showAppToast } from '@/components/shared/AppToasts';
import {
  chapterCacheDownloadStore,
  enqueueChapterDownload,
  stopChapterDownload,
} from '@/lib/chapter-cache';
import { isLocalBook } from '@/lib/local-book';
import type { Book } from '@/types';

export type OfflineCacheChapterRange = {
  /** 1-based 起始章 */
  start: number;
  /** 1-based 结束章 */
  end: number;
};

/** 目录章数，优先 catalogSize，否则 book.totalChapterNum */
export function resolveOfflineCacheChapterTotal(
  book: Book | null,
  catalogSize: number,
): number {
  if (catalogSize > 0) return catalogSize;
  const n = book?.totalChapterNum ?? 0;
  return n > 0 ? n : 1;
}

/** 默认从当前阅读章（1-based）缓存到末章 */
export function offlineCacheDefaultRange(
  chapterIndex: number,
  total: number,
): OfflineCacheChapterRange {
  const start = Math.min(chapterIndex + 1, total);
  return { start, end: total };
}

export function parseOfflineCacheChapterRange(args: {
  startRaw: string;
  endRaw: string;
  max: number;
  defaultStart: number;
}): OfflineCacheChapterRange | null {
  const { startRaw, endRaw, max, defaultStart } = args;
  const start = startRaw.trim() === '' ? defaultStart : Number.parseInt(startRaw, 10);
  const end = endRaw.trim() === '' ? max : Number.parseInt(endRaw, 10);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    showAppToast({ title: '请输入有效章节号', variant: 'warning' });
    return null;
  }
  if (start < 1 || end < 1 || start > max || end > max) {
    showAppToast({
      title: '章节范围无效',
      description: `请在 1–${max} 之间选择`,
      variant: 'warning',
    });
    return null;
  }
  if (start > end) {
    showAppToast({ title: '起始章节不能大于结束章节', variant: 'warning' });
    return null;
  }
  return { start, end };
}

export function enqueueOfflineCacheRange(
  bookUrl: string,
  range: OfflineCacheChapterRange,
): void {
  enqueueChapterDownload(bookUrl, range.start - 1, range.end - 1);
}

export function stopOfflineCacheForBook(bookUrl: string): void {
  stopChapterDownload(bookUrl);
}

export function isOfflineCacheDownloading(bookUrl: string): boolean {
  return Boolean(bookUrl && chapterCacheDownloadStore.isBookActive(bookUrl));
}

export function getOfflineCacheDownloadProgress(bookUrl: string) {
  return bookUrl ? chapterCacheDownloadStore.getProgress(bookUrl) : undefined;
}

/** 不可缓存时返回提示文案；可缓存时返回 null */
export function getOfflineCacheBlockedReason(
  book: Book | null | undefined,
  isGuestReading: boolean,
): string | null {
  if (!book) return '未打开书籍';
  if (isGuestReading) return '试读书籍请先加入书架';
  if (isLocalBook(book)) return '本地书籍无需缓存';
  return null;
}

export function formatOfflineCacheProgressText(
  done: number,
  total: number,
  currentIndex: number | null | undefined,
  options?: { suffix?: string },
): string {
  const suffix = options?.suffix ?? '';
  const chapter =
    currentIndex != null ? ` · 第 ${currentIndex + 1} 章` : '';
  return `正在缓存… ${done}/${total}${suffix}${chapter}`;
}
