/**
 * 阅读器书签（对齐 Legado Bookmark 实体）
 */

import * as bookmarksDb from '@/lib/database/bookmarks';
import { plainTextForAloud } from '@/lib/media/text/read-aloud';
import type { Book, Bookmark } from '@/types';

export interface ReaderBookmarkContext {
  book: Book;
  chapterIndex: number;
  chapterPos: number;
  chapterTitle: string;
  /** 选中文本；无选中时用章节标题 */
  selectedText?: string;
  note?: string;
}

export async function addReaderBookmark(ctx: ReaderBookmarkContext): Promise<Bookmark> {
  const text =
    ctx.selectedText?.trim() ||
    ctx.chapterTitle ||
    `第 ${ctx.chapterIndex + 1} 章`;
  const bookmark: Bookmark = {
    time: Date.now(),
    bookName: ctx.book.name,
    bookAuthor: ctx.book.author ?? '',
    chapterIndex: ctx.chapterIndex,
    chapterPos: ctx.chapterPos,
    chapterName: ctx.chapterTitle,
    bookText: text.slice(0, 500),
    content: ctx.note?.trim() || text.slice(0, 2000),
  };
  await bookmarksDb.insertBookmark(bookmark);
  return bookmark;
}

/** 从正文 HTML 取选中片段附近的书签摘要 */
export function selectionTextFromDocument(): string {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed) return '';
  return (sel.toString() ?? '').trim();
}

export function plainChapterExcerpt(htmlOrText: string, maxLen = 120): string {
  const plain = plainTextForAloud(htmlOrText);
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}
