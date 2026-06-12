/**
 * 阅读中编辑正文：优先读章节缓存，本地书回退到文件解析（TXT/EPUB）
 */

import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { isLocalBook, getLocalContent, readLocalBookContent, detectFileType } from '@/lib/local-book';
import type { Book, BookChapter } from '@/types';

export function isLocalBookContentEditable(book: Book): boolean {
  if (!isLocalBook(book)) return true;
  const hint = book.originName || book.bookUrl;
  const type = detectFileType(hint);
  return type === 'txt' || type === 'epub';
}

export async function readChapterRawForEdit(
  book: Book,
  chapterIndex: number,
  chapter: BookChapter | null | undefined,
  fallbackContent = '',
): Promise<string> {
  const cached = await readCachedChapterRaw(book.bookUrl, chapterIndex);
  if (cached?.trim()) return cached;

  if (isLocalBook(book) && chapter) {
    const fileContent = await readLocalBookContent(book.bookUrl);
    const raw = await getLocalContent(book, chapter, fileContent);
    if (raw?.trim()) return raw;
  }

  return fallbackContent;
}
