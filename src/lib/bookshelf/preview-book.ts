/**
 * 试读/试听/试看预览条目与 Book 互转
 */

import type { MediaKind } from '@/lib/book-source/book-type';
import { BookType } from '@/lib/book-source/book-type';
import type { MediaPreviewItem } from '@/lib/database/media-groups';
import type { Book } from '@/types';
import { getPreviewGroupLabel } from '@/lib/bookshelf/media-group-display';

export const PREVIEW_BOOK_URL_PREFIX = 'preview:';

export function isPreviewBook(book: Book): boolean {
  return book.bookUrl.startsWith(PREVIEW_BOOK_URL_PREFIX);
}

export function previewBookUrl(id: string): string {
  return `${PREVIEW_BOOK_URL_PREFIX}${id}`;
}

export function previewIdFromBookUrl(bookUrl: string): string {
  return bookUrl.slice(PREVIEW_BOOK_URL_PREFIX.length);
}

/** 与 upsertGuestPreview 一致的稳定 id，便于进度回写 */
export function previewItemIdFromRealBookUrl(bookUrl: string): string {
  return bookUrl.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || `p_${Date.now()}`;
}

export function bookFromPreviewItem(item: MediaPreviewItem): Book | null {
  try {
    const parsed = JSON.parse(item.refJson) as Partial<Book>;
    if (!parsed.bookUrl && !parsed.name) return null;
    const id = item.id;
    return {
      bookUrl: previewBookUrl(id),
      tocUrl: parsed.tocUrl ?? parsed.bookUrl ?? '',
      name: parsed.name ?? item.title ?? getPreviewGroupLabel(item.mediaKind),
      author: parsed.author ?? item.author ?? '',
      origin: parsed.origin ?? '',
      originName: parsed.originName ?? '',
      type: parsed.type ?? BookType.text,
      group: 0,
      latestChapterTime: 0,
      lastCheckTime: 0,
      lastCheckCount: 0,
      totalChapterNum: parsed.totalChapterNum ?? 0,
      durChapterIndex: parsed.durChapterIndex ?? 0,
      durChapterPos: parsed.durChapterPos ?? 0,
      durChapterTime: parsed.durChapterTime ?? item.lastOpenedAt ?? 0,
      durChapterTitle: parsed.durChapterTitle,
      durVolumeIndex: parsed.durVolumeIndex ?? 0,
      chapterInVolumeIndex: parsed.chapterInVolumeIndex ?? 0,
      canUpdate: parsed.canUpdate ?? true,
      order: parsed.order ?? 0,
      originOrder: parsed.originOrder ?? 0,
      syncTime: parsed.syncTime ?? 0,
      coverUrl: parsed.coverUrl ?? item.coverUrl,
      intro: parsed.intro,
      kind: parsed.kind,
      customTag: 'preview',
      variable: parsed.variable,
      readConfig: parsed.readConfig,
    };
  } catch {
    return null;
  }
}

export function buildPreviewPayload(book: Book): string {
  const realUrl = book.bookUrl.startsWith(PREVIEW_BOOK_URL_PREFIX)
    ? previewIdFromBookUrl(book.bookUrl)
    : book.bookUrl;
  return JSON.stringify({
    bookUrl: realUrl,
    tocUrl: book.tocUrl,
    name: book.name,
    author: book.author,
    origin: book.origin,
    originName: book.originName,
    type: book.type,
    coverUrl: book.coverUrl,
    intro: book.intro,
    kind: book.kind,
    variable: book.variable,
    readConfig: book.readConfig,
    totalChapterNum: book.totalChapterNum,
    durChapterIndex: book.durChapterIndex,
    durChapterPos: book.durChapterPos,
    durChapterTime: book.durChapterTime,
    durChapterTitle: book.durChapterTitle,
    durVolumeIndex: book.durVolumeIndex,
    chapterInVolumeIndex: book.chapterInVolumeIndex,
  });
}

export async function resolvePreviewBookForOpen(displayBook: Book): Promise<Book | null> {
  if (!isPreviewBook(displayBook)) return displayBook;
  const id = previewIdFromBookUrl(displayBook.bookUrl);
  const { getPreviewItemsByKind } = await import('@/lib/database/media-groups');
  const items = await getPreviewItemsByKind();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  try {
    return JSON.parse(item.refJson) as Book;
  } catch {
    return null;
  }
}

export async function upsertGuestPreview(
  book: Book,
  mediaKind: MediaKind,
): Promise<void> {
  if (book.bookUrl.startsWith(PREVIEW_BOOK_URL_PREFIX)) return;
  const { upsertPreviewItem } = await import('@/lib/database/media-groups');
  const id = previewItemIdFromRealBookUrl(book.bookUrl);
  await upsertPreviewItem({
    id,
    mediaKind,
    title: book.name,
    author: book.author,
    coverUrl: book.coverUrl,
    refJson: buildPreviewPayload(book),
  });
}

/** 客书进度写入试读条目（不入 books 表） */
export async function updateGuestPreviewProgress(
  book: Book,
  mediaKind: MediaKind,
): Promise<void> {
  if (book.bookUrl.startsWith(PREVIEW_BOOK_URL_PREFIX)) return;
  const { upsertPreviewItem } = await import('@/lib/database/media-groups');
  const id = previewItemIdFromRealBookUrl(book.bookUrl);
  await upsertPreviewItem({
    id,
    mediaKind,
    title: book.name,
    author: book.author,
    coverUrl: book.coverUrl,
    refJson: buildPreviewPayload(book),
  });
  window.dispatchEvent(new CustomEvent('read-record-updated'));
}

/** 按书名作者从试读表还原展示用 Book（供最近阅读打开） */
export async function findPreviewDisplayBookByNameAuthor(
  name: string,
  author: string,
): Promise<Book | null> {
  const { getPreviewItemsByKind } = await import('@/lib/database/media-groups');
  const items = await getPreviewItemsByKind();
  const match = items.find(
    (item) =>
      (item.title ?? '') === name && (item.author ?? '') === (author ?? ''),
  );
  return match ? bookFromPreviewItem(match) : null;
}
