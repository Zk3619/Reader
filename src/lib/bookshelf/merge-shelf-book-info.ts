/**
 * 书籍详情 / 发现列表数据补全书架 books 表元信息（作者、简介、封面等）。
 * 对齐 legado：详情页加载完成后回写书架，避免探索页缺字段时入架信息永久丢失。
 */

import * as booksDb from '@/lib/database/books';
import { resolveBookType } from '@/lib/book-source/book-type';
import { parseUpdateTimeToMs } from '@/lib/format/display-time';
import { preferDetailField, preferDetailIntro } from '@/lib/book-source/intro-merge';
import {
  mergeBookContentVariable,
  preferDetailContentSource,
  readBookContentSource,
} from '@/lib/book-source/utils';
import type { Book, NewBook, SearchBook } from '@/types';

const SHELF_INFO_FIELDS: (keyof Book)[] = [
  'name',
  'author',
  'kind',
  'intro',
  'coverUrl',
  'tocUrl',
  'originName',
  'wordCount',
  'latestChapterTitle',
  'latestChapterTime',
  'variable',
  'type',
];

/** 判断字符串是否有意义（非空、非纯空白/标点） */
export function isMeaningfulBookField(s: string | undefined | null): boolean {
  if (!s) return false;
  return s.replace(/[\s•·\-—_|,，.。、/\\]+/g, '').length > 0;
}

function pickMeaningfulField(fresh?: string, existing?: string): string {
  const f = fresh?.trim();
  if (isMeaningfulBookField(f)) return f!;
  const e = existing?.trim();
  if (isMeaningfulBookField(e)) return e!;
  return f || e || '';
}

function resolveShelfLatestChapterTime(
  detailUpdateTime: string | undefined,
  mergedTitle: string | undefined,
  existingTitle: string | undefined,
  existingTime: number,
): number {
  const parsed = parseUpdateTimeToMs(detailUpdateTime);
  if (parsed != null) return parsed;
  if (
    isMeaningfulBookField(mergedTitle) &&
    mergedTitle?.trim() !== existingTitle?.trim()
  ) {
    return Date.now();
  }
  return existingTime;
}

/** 将详情页 / 发现 SearchBook 合并进书架 Book（保留阅读进度、分组、自定义字段） */
export function mergeShelfBookFromSearchBook(existing: Book, detail: SearchBook): Book {
  const incomingType = resolveBookType(detail.type, detail.tab);
  const contentSource = preferDetailContentSource(
    readBookContentSource({ variable: existing.variable }),
    detail.source,
  );
  const latestChapterTitle = pickMeaningfulField(
    detail.latestChapterTitle,
    existing.latestChapterTitle,
  );

  return {
    ...existing,
    name: preferDetailField(detail.name, existing.name) ?? existing.name,
    author: pickMeaningfulField(detail.author, existing.author),
    kind: preferDetailField(detail.kind, existing.kind) ?? existing.kind,
    intro: preferDetailIntro(detail.intro, existing.intro) ?? existing.intro,
    coverUrl: preferDetailField(detail.coverUrl, existing.coverUrl) ?? existing.coverUrl,
    tocUrl: preferDetailField(detail.tocUrl, existing.tocUrl) ?? existing.tocUrl,
    originName: preferDetailField(detail.originName, existing.originName) ?? existing.originName,
    wordCount: preferDetailField(detail.wordCount, existing.wordCount) ?? existing.wordCount,
    latestChapterTitle: latestChapterTitle || existing.latestChapterTitle,
    latestChapterTime: resolveShelfLatestChapterTime(
      detail.latestChapterUpdateTime,
      latestChapterTitle,
      existing.latestChapterTitle,
      existing.latestChapterTime,
    ),
    type: incomingType !== 0 ? incomingType : existing.type,
    variable: mergeBookContentVariable(existing.variable, { source: contentSource }),
  };
}

/** NewBook 入架时补全已有书架记录 */
export function mergeShelfBookFromNewBook(existing: Book, incoming: NewBook): Book {
  return mergeShelfBookFromSearchBook(existing, {
    bookUrl: incoming.bookUrl,
    tocUrl: incoming.tocUrl ?? incoming.bookUrl,
    name: incoming.name,
    author: incoming.author ?? '',
    kind: incoming.kind,
    intro: incoming.intro,
    coverUrl: incoming.coverUrl,
    origin: incoming.origin,
    originName: incoming.originName ?? '',
    type: incoming.type ?? 0,
    variable: incoming.variable,
    time: existing.durChapterTime,
    originOrder: existing.originOrder,
    chapterWordCount: 0,
    respondTime: 0,
  });
}

export function shelfBookInfoMetadataChanged(before: Book, after: Book): boolean {
  return SHELF_INFO_FIELDS.some((key) => before[key] !== after[key]);
}

function notifyShelfBookInfoUpdated(bookUrl: string): void {
  window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
  window.dispatchEvent(
    new CustomEvent('bookshelf-book-updated', { detail: { bookUrl } }),
  );
}

/** 详情页数据回写书架；无变化或不在架时返回 null */
export async function syncShelfBookFromSearchBook(
  detail: SearchBook,
): Promise<Book | null> {
  const bookUrl = detail.bookUrl?.trim();
  if (!bookUrl) return null;

  const existing = await booksDb.getBook(bookUrl);
  if (!existing) return null;

  const merged = mergeShelfBookFromSearchBook(existing, detail);
  if (!shelfBookInfoMetadataChanged(existing, merged)) return null;

  await booksDb.updateBook(merged);
  notifyShelfBookInfoUpdated(bookUrl);
  return merged;
}
