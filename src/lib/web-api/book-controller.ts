/**

 * 书架 / 目录 / 正文 Web API（对齐 Legado BookController.kt）

 */



import * as booksDb from '@/lib/database/books';

import * as chaptersDb from '@/lib/database/chapters';

import * as sourcesDb from '@/lib/database/sources';

import { updateBookToc } from '@/lib/book-source/update-toc';

import { fetchAndCacheChapterContent, readCachedChapterRaw } from '@/lib/chapter-cache/storage';

import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';

import { loadReaderUiConfig, saveReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import {
  buildReaderLegadoConfigBundle,
  parseReaderLegadoConfigPayload,
} from '@/lib/media/text/legado-read-config-sync';

import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';

import { queryParam } from '@/lib/web-api/query';

import type { Book, BookChapter } from '@/types';



type BookProgressPayload = {

  name?: string;

  author?: string;

  durChapterIndex?: number;

  durChapterPos?: number;

  durChapterTime?: number;

  durChapterTitle?: string;

};



function parseBook(raw: string | null): Book | null {

  if (!raw?.trim()) return null;

  try {

    return JSON.parse(raw) as Book;

  } catch {

    return null;

  }

}



async function readerUiForApi() {

  const saved = await loadReaderUiConfig();

  return { ...defaultTextViewerUiConfig, ...saved };

}



export async function getBookshelfApi(): Promise<LegadoReturnData<Book[]>> {

  const books = await booksDb.getAllBooks();

  if (books.length === 0) return legadoErr('还没有添加小说');

  const sorted = [...books].sort((a, b) => (b.durChapterTime ?? 0) - (a.durChapterTime ?? 0));

  return legadoOk(sorted);

}



export async function getChapterListApi(

  query: Record<string, string> | undefined,

): Promise<LegadoReturnData<BookChapter[]>> {

  const bookUrl = queryParam(query, 'url');

  if (!bookUrl) return legadoErr('未找到书籍');

  let chapters = await chaptersDb.getChapterList(bookUrl);

  if (chapters.length === 0) {

    try {

      await updateBookToc(bookUrl);

      chapters = await chaptersDb.getChapterList(bookUrl);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return legadoErr(msg);

    }

  }

  return legadoOk(chapters);

}



export async function refreshTocApi(

  query: Record<string, string> | undefined,

): Promise<LegadoReturnData<BookChapter[]>> {

  const bookUrl = queryParam(query, 'url');

  if (!bookUrl) return legadoErr('未找到书籍');

  try {

    const nextUrl = await updateBookToc(bookUrl);

    const chapters = await chaptersDb.getChapterList(nextUrl);

    return legadoOk(chapters);

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    return legadoErr(msg);

  }

}



export async function getBookContentApi(

  query: Record<string, string> | undefined,

): Promise<LegadoReturnData<string>> {

  const bookUrl = queryParam(query, 'url');

  const indexRaw = queryParam(query, 'index');

  if (!bookUrl || indexRaw == null) return legadoErr('参数错误');

  const index = Number.parseInt(indexRaw, 10);

  if (!Number.isFinite(index) || index < 0) return legadoErr('参数错误');



  const book = await booksDb.getBook(bookUrl);

  if (!book) return legadoErr('未找到书籍');



  let chapters = await chaptersDb.getChapterList(book.bookUrl);

  if (chapters.length === 0) {

    try {

      await updateBookToc(book.bookUrl);

      chapters = await chaptersDb.getChapterList(book.bookUrl);

    } catch {

      return legadoErr('目录为空');

    }

  }



  const chapter = chapters[index];

  if (!chapter) return legadoErr('章节不存在');



  const source = await sourcesDb.getSource(book.origin);

  if (!source) return legadoErr('未找到书源');



  let raw = await readCachedChapterRaw(book.bookUrl, index);

  if (!raw?.trim()) {

    const next = chapters[index + 1];

    raw =

      (await fetchAndCacheChapterContent(source, book, chapter, next?.url, index)) ?? '';

  }

  if (!raw?.trim()) return legadoErr('正文为空');



  const uiConfig = await readerUiForApi();

  const content = await applyChapterDisplayProcessing(raw, book, source, chapter, uiConfig);

  return legadoOk(content);

}



export async function saveBookApi(postData: string | null): Promise<LegadoReturnData<string>> {

  const book = parseBook(postData);

  if (!book?.bookUrl?.trim()) return legadoErr('格式不对');

  const existing = await booksDb.getBook(book.bookUrl);

  if (existing) {

    await booksDb.updateBook(book);

  } else {

    await booksDb.insertBook(book);

  }

  return legadoOk('');

}



export async function deleteBookApi(postData: string | null): Promise<LegadoReturnData<string>> {

  const book = parseBook(postData);

  if (!book?.bookUrl?.trim()) return legadoErr('格式不对');

  await booksDb.deleteBook(book.bookUrl);

  return legadoOk('');

}



export async function saveBookProgressApi(postData: string | null): Promise<LegadoReturnData<string>> {

  if (!postData?.trim()) return legadoErr('数据不能为空');

  let progress: BookProgressPayload;

  try {

    progress = JSON.parse(postData) as BookProgressPayload;

  } catch {

    return legadoErr('格式不对');

  }

  const name = progress.name?.trim();

  const author = progress.author?.trim() ?? '';

  if (!name) return legadoErr('格式不对');



  const book = await booksDb.getBookByNameAndAuthor(name, author);

  if (!book) return legadoErr('未找到书籍');



  const chapterIndex = Number(progress.durChapterIndex ?? book.durChapterIndex ?? 0);

  const chapterPos = Number(progress.durChapterPos ?? book.durChapterPos ?? 0);

  await booksDb.updateReadProgress(book.bookUrl, {

    chapterIndex,

    chapterPos,

    chapterTitle: progress.durChapterTitle ?? book.durChapterTitle,

  });



  if (typeof progress.durChapterTime === 'number') {

    await booksDb.updateBook({

      ...book,

      durChapterIndex: chapterIndex,

      durChapterPos: chapterPos,

      durChapterTitle: progress.durChapterTitle ?? book.durChapterTitle,

      durChapterTime: progress.durChapterTime,

    });

  }

  const updated = await booksDb.getBook(book.bookUrl);
  if (updated) {
    void import('@/lib/backup/webdav-book-progress').then((m) =>
      m.uploadBookProgressToWebDav(updated),
    );
  }



  return legadoOk('');

}



export async function addLocalBookApi(): Promise<LegadoReturnData<boolean>> {
  return legadoErr('请使用 multipart 上传（fileName + fileData）');
}



export async function getReadConfigApi(): Promise<LegadoReturnData<string>> {

  const cfg = await loadReaderUiConfig();

  if (!cfg) return legadoErr('没有配置');

  return legadoOk(JSON.stringify(buildReaderLegadoConfigBundle(cfg)));

}



export async function saveReadConfigApi(postData: string | null): Promise<LegadoReturnData<string>> {

  if (!postData?.trim()) {

    await saveReaderUiConfig(defaultTextViewerUiConfig);

    return legadoOk('');

  }

  try {

    const parsed = JSON.parse(postData) as unknown;

    const merged = parseReaderLegadoConfigPayload(parsed, defaultTextViewerUiConfig);

    await saveReaderUiConfig(merged);

    return legadoOk('');

  } catch {

    return legadoErr('格式不对');
  }
}

