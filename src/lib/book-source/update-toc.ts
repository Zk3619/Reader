/**
 * 单本书籍目录更新（对应 Legado WebBook + MainViewModel.updateToc）
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import type { Book, BookInfo } from '@/types';
import { getBookInfo } from '@/lib/book-source/detail';
import { fetchChapterListDeduped, toNewBookChapter } from '@/lib/book-source/chapters';
import {
  addBookType,
  BOOK_TYPE_UPDATE_ERROR,
  removeBookType,
} from '@/lib/book-source/book-type';
import { migrateBookProgress } from '@/lib/bookshelf/book-migrate';
import type { BookChapter } from '@/types';

/** 更新目录后保留的阅读进度与用户自定义字段（有目录时按 legado 重映射章节索引） */
export function syncBookPreserveProgress(
  updated: Book,
  preserved: Book,
  chapters?: BookChapter[]
): Book {
  return migrateBookProgress(updated, preserved, chapters);
}

function applyBookInfoToBook(book: Book, info: BookInfo): void {
  if (info.name) book.name = info.name;
  if (info.author) book.author = info.author;
  if (info.kind) book.kind = info.kind;
  if (info.intro) book.intro = info.intro;
  if (info.coverUrl) book.coverUrl = info.coverUrl;
  if (info.tocUrl) book.tocUrl = info.tocUrl;
  if (info.latestChapterTitle) book.latestChapterTitle = info.latestChapterTitle;
  if (info.wordCount) book.wordCount = info.wordCount;
}

/**
 * 更新一本书的目录：拉取书源章节列表并写入数据库
 */
/** @returns 更新后的 bookUrl（可能与入参不同，例如 replaceBookUrl 后） */
export async function updateBookToc(bookUrl: string): Promise<string> {
  const book = await booksDb.getBook(bookUrl);
  if (!book) return bookUrl;
  if (isLocalBook(book)) return bookUrl;
  if (book.canUpdate === false) return bookUrl;

  const source = await sourcesDb.getSource(book.origin);
  if (!source) {
    const marked = { ...book, type: addBookType(book.type, BOOK_TYPE_UPDATE_ERROR) };
    await booksDb.updateBook(marked);
    throw new Error(`《${book.name}》未找到书源`);
  }

  const oldBook = { ...book };
  let working: Book = { ...book };
  const liveSourceName = source.sourceName.trim();
  if (liveSourceName && working.originName.trim() !== liveSourceName) {
    working.originName = liveSourceName;
  }

  try {
    if (!working.tocUrl?.trim()) {
      const info = await getBookInfo(source, working.bookUrl, {
        book: working as unknown as Record<string, unknown>,
        bookVariable: working.variable,
      });
      if (!info) {
        throw new Error('获取书籍信息失败');
      }
      applyBookInfoToBook(working, info);
    }
    // preUpdateJs：需 AnalyzeRule 书籍上下文，Reader 暂未实现，与 Legado 行为略有不一致

    const tocUrl = working.tocUrl?.trim() || working.bookUrl;
    const chapters = await fetchChapterListDeduped(source, tocUrl, {
      reverseToc: working.readConfig?.reverseToc === true,
      bookVariable: working.variable,
    });
    if (chapters.length === 0) {
      throw new Error('章节列表为空');
    }

    const now = Date.now();
    const oldTotal = Math.max(oldBook.totalChapterNum, 0);
    const newTotal = chapters.length;

    working.tocUrl = tocUrl;
    working.lastCheckTime = now;
    working.totalChapterNum = newTotal;
    working.type = removeBookType(working.type, BOOK_TYPE_UPDATE_ERROR);

    const lastChapter = chapters[chapters.length - 1];
    if (lastChapter?.title) {
      working.latestChapterTitle = lastChapter.title;
    }

    // 对齐 Legado：仅当发现新章节时更新 latestChapterTime / lastCheckCount
    if (newTotal > oldTotal) {
      working.lastCheckCount = newTotal - oldTotal;
      working.latestChapterTime = now;
    } else {
      working.lastCheckCount = 0;
      working.latestChapterTime = oldBook.latestChapterTime;
    }

    working = syncBookPreserveProgress(working, oldBook, chapters);

    const originalUrl = bookUrl;
    if (working.bookUrl !== originalUrl) {
      await booksDb.replaceBookUrl(originalUrl, working);
      await chaptersDb.deleteChaptersByBook(working.bookUrl);
    } else {
      await booksDb.updateBook(working);
      await chaptersDb.deleteChaptersByBook(originalUrl);
    }

    const newChapters = chapters.map((ch) => toNewBookChapter(ch, working.bookUrl));
    await chaptersDb.insertChapters(newChapters);
    return working.bookUrl;
  } catch (error) {
    const latest =
      (await booksDb.getBook(bookUrl)) ??
      (await booksDb.getBook(working.bookUrl));
    if (latest) {
      const marked = {
        ...latest,
        type: addBookType(latest.type, BOOK_TYPE_UPDATE_ERROR),
      };
      await booksDb.updateBook(marked);
    }
    throw error;
  }
  return bookUrl;
}
