/**
 * 本地 TXT 重新分章（对齐 Legado TocActivity 换规则后重解析）
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import { updateBookChapterMeta } from '@/lib/bookshelf/save-book-to-shelf';
import {
  encodeTocRuleStorage,
  isStoredTxtTocRule,
  parseTocRuleStorage,
} from '@/lib/local-book/txt-toc-rule-engine';
import {
  captureLocalTxtFileMeta,
  mergeLocalTxtFileMeta,
} from '@/lib/local-book/local-txt-file-meta';
import { readLocalBookContent } from '@/lib/local-book/import';
import { getTxtChapterList } from '@/lib/local-book/txt-parser';
import type { Book } from '@/types';
import type { NewBookChapter } from '@/types/book-chapter';

export interface ReparseTxtBookResult {
  book: Book;
  chapterCount: number;
  tocRule: string;
}

export interface ReparseLocalTxtBookOptions {
  /** 是否拆分超长章节，写入 readConfig.splitLongChapter */
  splitLongChapter?: boolean;
}

/**
 * 使用指定目录规则重新解析本地 TXT 并更新数据库章节
 * @param tocRuleStorage Legado 格式：`rule🫅🈳🏻replacement`，空字符串表示恢复自动识别
 */
export async function reparseLocalTxtBook(
  bookUrl: string,
  tocRuleStorage?: string,
  options?: ReparseLocalTxtBookOptions,
): Promise<ReparseTxtBookResult> {
  const book = await booksDb.getBook(bookUrl);
  if (!book) throw new Error('书籍不存在');

  const content = await readLocalBookContent(bookUrl);
  const workingBook: Book = { ...book };

  if (options?.splitLongChapter !== undefined) {
    workingBook.readConfig = {
      ...workingBook.readConfig,
      splitLongChapter: options.splitLongChapter,
    };
  }

  if (tocRuleStorage !== undefined) {
    workingBook.tocUrl = tocRuleStorage;
  } else if (!isStoredTxtTocRule(workingBook.tocUrl)) {
    workingBook.tocUrl = '';
  }

  const result = await getTxtChapterList(workingBook, content, workingBook.charset);
  const chapters = result.chapters;
  const tocRule = result.tocRule ?? workingBook.tocUrl ?? '';

  if (tocRule && isStoredTxtTocRule(tocRule)) {
    workingBook.tocUrl = tocRule;
  } else if (result.tocRule) {
    workingBook.tocUrl = result.tocRule;
  } else if (tocRuleStorage !== undefined) {
    workingBook.tocUrl = tocRuleStorage;
  }

  if (result.charset) workingBook.charset = result.charset;
  if (result.title) workingBook.name = result.title;
  if (result.author) workingBook.author = result.author;
  if (result.intro) workingBook.intro = result.intro;

  workingBook.totalChapterNum = chapters.length;
  workingBook.latestChapterTitle =
    chapters.length > 0 ? chapters[chapters.length - 1]?.title : undefined;

  const durIndex = Math.min(
    workingBook.durChapterIndex,
    Math.max(chapters.length - 1, 0),
  );
  workingBook.durChapterIndex = durIndex;
  workingBook.durChapterTitle = chapters[durIndex]?.title;
  workingBook.variable = mergeLocalTxtFileMeta(workingBook.variable, {
    ...(await captureLocalTxtFileMeta(bookUrl)),
    txtOffsetUnit: result.offsetUnit ?? 'char',
  });
  workingBook.latestChapterTime = Date.now();

  await booksDb.updateBook(workingBook);
  await chaptersDb.deleteChaptersByBook(bookUrl);

  const newChapters: NewBookChapter[] = chapters.map((ch) => ({
    url: ch.url,
    title: ch.title,
    bookUrl,
    index: ch.index,
    baseUrl: ch.baseUrl,
    isVolume: ch.isVolume,
    isVip: ch.isVip,
    isPay: ch.isPay,
    tag: ch.tag,
    wordCount: ch.wordCount,
    variable: ch.variable,
  }));
  await chaptersDb.insertChapters(newChapters);

  for (const ch of chapters) {
    if (ch.start != null || ch.end != null) {
      await chaptersDb.updateChapter({ ...ch, bookUrl });
    }
  }

  await updateBookChapterMeta(bookUrl, chapters);

  const updated = await booksDb.getBook(bookUrl);
  if (!updated) throw new Error('更新后无法读取书籍');

  return {
    book: updated,
    chapterCount: chapters.length,
    tocRule: workingBook.tocUrl,
  };
}

/** 将规则对象编码为 tocUrl 存储串 */
export function buildTxtTocRuleStorage(rule: string, replacement = ''): string {
  return encodeTocRuleStorage(rule, replacement);
}

/** 解析当前书籍使用的目录规则（用于 UI 高亮） */
export function getBookTxtTocRuleStorage(book: Book): TocRuleStorageView {
  const stored = parseTocRuleStorage(book.tocUrl);
  if (stored) return stored;
  const custom = (book.readConfig as { tocRule?: string } | undefined)?.tocRule?.trim();
  if (custom) return { rule: custom, replacement: '' };
  return { rule: '', replacement: '' };
}

export interface TocRuleStorageView {
  rule: string;
  replacement: string;
}

function isTxtFileName(name: string): boolean {
  return name.toLowerCase().split('.').pop() === 'txt';
}

function isLocalTxtBook(book: Book): boolean {
  const isLocal = book.origin === 'local' || book.origin.startsWith('local::');
  if (!isLocal) return false;
  if (isTxtFileName(book.originName)) return true;
  const urlName = book.bookUrl.replace(/^.*[/\\]/, '');
  return isTxtFileName(urlName);
}

/**
 * 本地 TXT 文件变更后自动重分章（对齐 Legado isLocalModified + getChapterList）
 */
export async function ensureLocalTxtCatalogFresh(book: Book): Promise<Book> {
  if (!isLocalTxtBook(book)) return book;
  const { isLocalTxtFileModified } = await import('@/lib/local-book/local-txt-file-meta');
  if (!(await isLocalTxtFileModified(book))) return book;
  try {
    const result = await reparseLocalTxtBook(book.bookUrl);
    return result.book;
  } catch (e) {
    console.warn('[TXT目录] 文件已变更但重分章失败:', e);
    return book;
  }
}
