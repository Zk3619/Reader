import type { Book } from '@/types';
import {
  ReadStatus,
  isFinishedStatus,
  isReadingStatus,
  isUnreadStatus,
} from '@/types/book-read-status';

/** 与 Legado Book.getUnreadChapterNum 一致：当前章之后的未读章数 */
export function getUnreadChapterNum(book: Book): number {
  const total = Math.max(book.totalChapterNum, 0);
  if (total <= 0) return 0;
  const index = Math.max(book.durChapterIndex, 0);
  return Math.max(total - index - 1, 0);
}

/** 章内进度 0–1（durChapterPos；>1 视为非比例进度，不计入） */
function chapterProgressRatio(book: Book): number {
  const pos = book.durChapterPos ?? 0;
  if (pos <= 0) return 0;
  if (pos > 1) return 0;
  return pos;
}

/** 由 Legado 字段推断运行时阅读状态（不落库） */
export function getBookReadStatus(book: Book): ReadStatus {
  const progress = chapterProgressRatio(book);
  const hasTitle = Boolean(book.durChapterTitle?.trim());
  const hasIndex = (book.durChapterIndex ?? 0) > 0;
  const hasProgress = progress > 0.001;
  const openedAt = (book.durChapterTime ?? 0) > 0;

  if (!hasTitle && !hasIndex && !hasProgress && (!openedAt || progress <= 0)) {
    return ReadStatus.Unread;
  }

  const total = Math.max(book.totalChapterNum, 0);
  if (total > 0 && getUnreadChapterNum(book) <= 0) {
    const onLast = book.durChapterIndex >= total - 1;
    if (onLast && progress >= 0.95) return ReadStatus.Finished;
    if (onLast) return ReadStatus.Reading;
    return ReadStatus.Finished;
  }

  return ReadStatus.Reading;
}

/** 是否打开过正文 */
export function hasStartedReading(book: Book): boolean {
  return !isUnreadStatus(getBookReadStatus(book));
}

/** 书架检查是否发现新章节（对齐 Legado lastCheckCount > 0 高亮） */
export function hasBookshelfChapterUpdate(book: Book): boolean {
  return (book.lastCheckCount ?? 0) > 0;
}

/** 书架阅读进度徽标状态 */
export type BookshelfReadingBadgeState = 'unread' | 'reading' | 'finished';

export function isBookFinishedReading(book: Book): boolean {
  return isFinishedStatus(getBookReadStatus(book));
}

export function getBookshelfReadingBadgeState(book: Book): BookshelfReadingBadgeState {
  const status = getBookReadStatus(book);
  if (isUnreadStatus(status)) return 'unread';
  if (isFinishedStatus(status)) return 'finished';
  if (isReadingStatus(status)) return 'reading';
  return 'unread';
}

/**
 * 书架徽标数字（列表 / 网格统一）：
 * - 未读：总章节数
 * - 在读：后方剩余未读章数；末章进行中且剩余为 0 时显示 1
 * - 已读完：不显示
 */
export function getBookshelfUnreadBadgeCount(book: Book): number {
  const state = getBookshelfReadingBadgeState(book);
  if (state === 'unread') return Math.max(book.totalChapterNum, 0);
  if (state === 'reading') {
    const remaining = getUnreadChapterNum(book);
    if (remaining > 0) return remaining;
    const total = Math.max(book.totalChapterNum, 0);
    if (total > 0 && book.durChapterIndex >= total - 1) return 1;
    return 0;
  }
  return 0;
}

export function shouldShowBookshelfUnreadBadge(book: Book): boolean {
  return getBookshelfReadingBadgeState(book) !== 'finished' && getBookshelfUnreadBadgeCount(book) > 0;
}

/** 最新章节展示序号（1-based，有目录时取末章） */
export function getLatestChapterDisplayIndex(book: Book): number | null {
  const total = Math.max(book.totalChapterNum, 0);
  if (total > 0) return total;
  return null;
}

/** 最近阅读章节展示序号（1-based） */
export function getReadingChapterDisplayIndex(book: Book): number | null {
  if (!hasStartedReading(book)) return null;
  return Math.max(book.durChapterIndex, 0) + 1;
}

export function formatChapterIndexAndTitle(index: number | null, title?: string): string {
  const t = title?.trim();
  if (index != null && index > 0 && t) return `${index} ${t}`;
  if (index != null && index > 0) return String(index);
  if (t) return t;
  return '—';
}

export function formatChapterIndexOnly(index: number | null): string {
  if (index != null && index > 0) return String(index);
  return '—';
}

export function formatUnreadBadgeCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  return String(Math.floor(count));
}

/** 最新章节更新时间相对文案（对齐 Legado toTimeAgo） */
export function formatLatestChapterTimeAgo(timestampMs: number): string | null {
  if (!timestampMs || timestampMs <= 0) return null;
  const now = Date.now();
  const seconds = Math.abs(now - timestampMs) / 1000;
  const suffix = timestampMs <= now ? '前' : '后';

  const start =
    seconds < 60
      ? `${Math.floor(seconds)}秒`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}分钟`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}小时`
          : seconds < 604_800
            ? `${Math.floor(seconds / 86400)}天`
            : seconds < 2_628_000
              ? `${Math.floor(seconds / 604_800)}周`
              : seconds < 31_536_000
                ? `${Math.floor(seconds / 2_628_000)}月`
                : `${Math.floor(seconds / 31_536_000)}年`;

  return start + suffix;
}

export function shouldShowBookshelfLastUpdateTime(
  book: Book,
  enabled: boolean,
): boolean {
  return enabled && formatLatestChapterTimeAgo(book.latestChapterTime) != null;
}
