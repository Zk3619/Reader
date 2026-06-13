/**
 * 书架书籍在阅读前补全详情与目录元数据（过早入架、探索页缺字段等场景）。
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { getBookInfo } from '@/lib/book-source/detail';
import { bookInfoToSearchBook } from '@/lib/bookshelf/book-info-to-search-book';
import { syncShelfBookFromSearchBook } from '@/lib/bookshelf/merge-shelf-book-info';
import { isLocalBook } from '@/lib/local-book';
import type { Book } from '@/types';

function shelfTocUrlLooksUnresolved(book: Book): boolean {
  const tocUrl = book.tocUrl?.trim();
  if (!tocUrl) return true;
  return tocUrl === book.bookUrl;
}

/** 在线书架书是否可能在缺详情/错误 tocUrl 下无法拉目录 */
export function shelfBookNeedsDetailRepairForReading(book: Book): boolean {
  if (isLocalBook(book) || !book.origin) return false;
  if (shelfTocUrlLooksUnresolved(book)) return true;
  return (book.totalChapterNum ?? 0) <= 0 || !book.latestChapterTitle?.trim();
}

export function shelfBookTocUrlLooksUnresolved(book: Book): boolean {
  return shelfTocUrlLooksUnresolved(book);
}

/**
 * 打开阅读器前：必要时拉详情 API 修正 tocUrl / 作者 / 最新章节等，并回写 books 表。
 */
export async function ensureShelfBookMetadataForReading(book: Book): Promise<Book> {
  if (isLocalBook(book) || !book.origin) return book;

  let saved = (await booksDb.getBook(book.bookUrl)) ?? book;
  const chapterCount = await chaptersDb.getChapterCount(saved.bookUrl);
  const needsDetail =
    shelfTocUrlLooksUnresolved(saved) ||
    (chapterCount === 0 && shelfBookNeedsDetailRepairForReading(saved));
  if (!needsDetail) return saved;

  const source = await sourcesDb.getSource(saved.origin);
  if (!source?.enabled) return saved;

  try {
    const info = await getBookInfo(source, saved.bookUrl, {
      bookVariable: saved.variable,
      durChapterTitle: saved.durChapterTitle,
    });
    if (!info) return saved;

    const synced = await syncShelfBookFromSearchBook(
      bookInfoToSearchBook(info, saved),
    );
    return synced ?? (await booksDb.getBook(saved.bookUrl)) ?? saved;
  } catch (e) {
    console.warn('[ensureShelfBookMetadataForReading] 补全详情失败:', e);
    return saved;
  }
}
