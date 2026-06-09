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
  /** 章节正文 HTML，用于在无选区/页文本时截取当前阅读位置附近的原文 */
  chapterHtml?: string;
  /** 选中文本；有选区时作为 bookText */
  selectedText?: string;
  /** 分页模式：当前页正文（Legado page.text） */
  pageText?: string;
  /** 用户笔记（content 字段） */
  note?: string;
}

/** 分页阅读：由页码计算章内 0–1 进度 */
export function pagedBookmarkChapterPos(pageIndex: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  return pageIndex / (pageCount - 1);
}

export type { BuildPagedBookmarkSnapshotInput } from '@/lib/media/text/reader-paged-bookmark-text';
export { buildPagedBookmarkSnapshot } from '@/lib/media/text/reader-paged-bookmark-text';

/** 按章节阅读进度（0–1）截取原文摘要，对齐 Legado 当前页/当前位置文本 */
export function bookmarkTextAtChapterPosition(
  htmlOrText: string,
  chapterPos: number,
  maxLen = 120,
): string {
  const plain = plainTextForAloud(htmlOrText).replace(/\s+/g, ' ').trim();
  if (!plain) return '';

  const ratio = Math.min(1, Math.max(0, chapterPos));
  const anchor = Math.round(plain.length * ratio);
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, anchor - half);
  let end = Math.min(plain.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }

  let excerpt = plain.slice(start, end).trim();
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < plain.length) excerpt = `${excerpt}…`;
  return excerpt;
}

/** 书签笔记：与原文相同时不重复展示 */
export function bookmarkNoteForDisplay(
  bookmark: Pick<Bookmark, 'bookText' | 'content'>,
): string {
  const note = bookmark.content.trim();
  const text = bookmark.bookText.trim();
  if (!note || note === text) return '';
  return note;
}

export async function addReaderBookmark(ctx: ReaderBookmarkContext): Promise<Bookmark> {
  const selected = ctx.selectedText?.trim();
  const pageText = ctx.pageText?.trim();
  const positionText =
    pageText ||
    selected ||
    (ctx.chapterHtml
      ? bookmarkTextAtChapterPosition(ctx.chapterHtml, ctx.chapterPos)
      : '') ||
    ctx.chapterTitle ||
    `第 ${ctx.chapterIndex + 1} 章`;

  const bookmark: Bookmark = {
    time: Date.now(),
    bookName: ctx.book.name,
    bookAuthor: ctx.book.author ?? '',
    chapterIndex: ctx.chapterIndex,
    chapterPos: ctx.chapterPos,
    chapterName: ctx.chapterTitle,
    bookText: positionText.slice(0, 500),
    content: ctx.note?.trim().slice(0, 2000) ?? '',
  };
  await bookmarksDb.insertBookmark(bookmark);
  return bookmark;
}

/** 从正文 HTML 取选中文本（限定在阅读器正文内） */
export function selectionTextFromDocument(): string {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed) return '';
  const anchor = sel.anchorNode;
  if (!anchor) return '';
  const inReader =
    anchor instanceof Element
      ? anchor.closest(
          '[data-reader-content], .reader-paged-viewport, .reader-scroll-viewport',
        )
      : anchor.parentElement?.closest(
          '[data-reader-content], .reader-paged-viewport, .reader-scroll-viewport',
        );
  if (!inReader) return '';
  return (sel.toString() ?? '').trim();
}

export function plainChapterExcerpt(htmlOrText: string, maxLen = 120): string {
  const plain = plainTextForAloud(htmlOrText);
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}
