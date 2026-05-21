/**
 * 单本书籍目录更新（对应 Legado WebBook + MainViewModel.updateToc）
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import type { Book, BookInfo } from '@/types';
import { getBookInfo } from '@/lib/book-source/detail';
import { getChapterList, toNewBookChapter } from '@/lib/book-source/chapters';
import {
  addBookType,
  BOOK_TYPE_UPDATE_ERROR,
  removeBookType,
} from '@/lib/book-source/book-type';

/** 更新目录后保留的阅读进度与用户自定义字段 */
export function syncBookPreserveProgress(updated: Book, preserved: Book): Book {
  return {
    ...updated,
    durChapterTime: preserved.durChapterTime,
    durChapterPos: preserved.durChapterPos,
    durChapterIndex: preserved.durChapterIndex,
    durChapterTitle: preserved.durChapterTitle,
    canUpdate: preserved.canUpdate,
    readConfig: preserved.readConfig,
    group: preserved.group,
    order: preserved.order,
    originOrder: preserved.originOrder,
    customCoverUrl: preserved.customCoverUrl,
    customIntro: preserved.customIntro,
    customTag: preserved.customTag,
    variable: preserved.variable ?? updated.variable,
  };
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
export async function updateBookToc(bookUrl: string): Promise<void> {
  const book = await booksDb.getBook(bookUrl);
  if (!book) return;
  if (isLocalBook(book)) return;
  if (book.canUpdate === false) return;

  const source = await sourcesDb.getSource(book.origin);
  if (!source) {
    const marked = { ...book, type: addBookType(book.type, BOOK_TYPE_UPDATE_ERROR) };
    await booksDb.updateBook(marked);
    throw new Error(`《${book.name}》未找到书源`);
  }

  const oldBook = { ...book };
  let working: Book = { ...book };

  try {
    if (!working.tocUrl?.trim()) {
      const info = await getBookInfo(source, working.bookUrl);
      if (!info) {
        throw new Error('获取书籍信息失败');
      }
      applyBookInfoToBook(working, info);
    }
    // preUpdateJs：需 AnalyzeRule 书籍上下文，Reader 暂未实现，与 Legado 行为略有不一致

    const tocUrl = working.tocUrl?.trim() || working.bookUrl;
    const chapters = await getChapterList(source, tocUrl);
    if (chapters.length === 0) {
      throw new Error('章节列表为空');
    }

    const now = Date.now();
    working.tocUrl = tocUrl;
    working.lastCheckTime = now;
    working.totalChapterNum = chapters.length;
    working.type = removeBookType(working.type, BOOK_TYPE_UPDATE_ERROR);

    const lastChapter = chapters[chapters.length - 1];
    if (lastChapter?.title) {
      working.latestChapterTitle = lastChapter.title;
      working.latestChapterTime = now;
    }

    working = syncBookPreserveProgress(working, oldBook);

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
}
