/**
 * 导出书籍为 TXT（对齐 Legado ExportBookService 简化版）
 */

import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, readLocalBookContent, getLocalContent } from '@/lib/local-book';
import {
  readCachedChapterRaw,
  fetchAndCacheChapterContent,
} from '@/lib/chapter-cache/storage';
import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';
import { saveTextFile } from '@/lib/export/save-text-file';
import type { Book } from '@/types';

export interface ExportBookOptions {
  /** 起始章节索引（含） */
  startIndex?: number;
  /** 结束章节索引（含） */
  endIndex?: number;
  /** 无缓存时是否联网拉取 */
  fetchMissing?: boolean;
  /** 仅导出已缓存章节（未缓存章节直接跳过） */
  onlyCached?: boolean;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

export async function buildBookTxtContent(
  book: Book,
  options?: ExportBookOptions,
): Promise<string> {
  const chapters = await chaptersDb.getChapterList(book.bookUrl);
  if (chapters.length === 0) {
    throw new Error('该书暂无章节目录，请先更新目录');
  }

  const start = options?.startIndex ?? 0;
  const end = options?.endIndex ?? chapters.length - 1;
  const fetchMissing = options?.fetchMissing ?? true;
  const onlyCached = options?.onlyCached ?? false;

  const source = !isLocalBook(book)
    ? await sourcesDb.getSource(book.origin)
    : null;

  const parts: string[] = [];

  if (isLocalBook(book)) {
    const fileContent = await readLocalBookContent(book.bookUrl);
    for (let i = start; i <= end && i < chapters.length; i++) {
      const ch = chapters[i];
      if (!ch) continue;
      const body = await getLocalContent(book, ch, fileContent);
      parts.push(`\n\n${ch.title}\n\n${body ?? ''}`);
    }
    return parts.join('').trimStart();
  }

  if (!source?.enabled) {
    throw new Error('书源不存在或已禁用');
  }

  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;

    let raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim() && fetchMissing) {
      const next = chapters[i + 1];
      raw = await fetchAndCacheChapterContent(
        source,
        book,
        ch,
        next?.url,
      );
    }
    if (!raw?.trim()) {
      if (onlyCached) continue;
      parts.push(`\n\n${ch.title}\n\n[本章未缓存且拉取失败]\n`);
      continue;
    }

    const display = await applyChapterDisplayProcessing(raw, book, source);
    parts.push(`\n\n${ch.title}\n\n${display}`);
  }

  const content = parts.join('').trimStart();
  if (onlyCached && !content.trim()) {
    throw new Error('该书暂无可导出的已缓存章节');
  }
  return content;
}

export async function exportBookAsTxt(
  book: Book,
  options?: ExportBookOptions,
): Promise<void> {
  const content = await buildBookTxtContent(book, options);
  const fileName = `${sanitizeFileName(book.name)}.txt`;
  await saveTextFile(fileName, content);
}
