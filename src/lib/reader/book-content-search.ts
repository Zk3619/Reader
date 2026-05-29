/**
 * 全书搜索（对齐 Legado SearchContent，优先扫描已缓存章节）
 */

import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { plainTextForAloud } from '@/lib/reader/read-aloud';
import type { Book, BookChapter } from '@/types';

export interface BookSearchHit {
  chapterIndex: number;
  chapterTitle: string;
  snippet: string;
  /** 命中在纯文本中的大致位置 */
  matchIndex: number;
}

const SNIPPET_RADIUS = 40;

function buildSnippet(text: string, index: number, keyword: string): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + keyword.length + SNIPPET_RADIUS);
  let s = text.slice(start, end);
  if (start > 0) s = `…${s}`;
  if (end < text.length) s = `${s}…`;
  return s;
}

function searchInText(
  plain: string,
  keyword: string,
  chapterIndex: number,
  chapterTitle: string,
  maxPerChapter: number,
  results: BookSearchHit[],
  maxResults: number,
): void {
  const lower = plain.toLowerCase();
  const kw = keyword.toLowerCase();
  let from = 0;
  let count = 0;
  while (results.length < maxResults && count < maxPerChapter) {
    const idx = lower.indexOf(kw, from);
    if (idx < 0) break;
    results.push({
      chapterIndex,
      chapterTitle,
      snippet: buildSnippet(plain, idx, keyword),
      matchIndex: idx,
    });
    from = idx + kw.length;
    count += 1;
  }
}

/**
 * 从 startIndex 向两侧扩展扫描目录；currentChapterPlain 为当前章已展示正文（可未落盘）
 */
export async function searchBookContent(
  book: Book,
  catalog: BookChapter[],
  keyword: string,
  options?: {
    maxResults?: number;
    startIndex?: number;
    currentChapterPlain?: string;
  },
): Promise<BookSearchHit[]> {
  const trimmed = keyword.trim();
  if (!trimmed || catalog.length === 0) return [];

  const maxResults = options?.maxResults ?? 80;
  const start = options?.startIndex ?? 0;
  const results: BookSearchHit[] = [];
  const maxPerChapter = 5;

  const indices: number[] = [];
  indices.push(start);
  for (let d = 1; d < catalog.length; d++) {
    if (start - d >= 0) indices.push(start - d);
    if (start + d < catalog.length) indices.push(start + d);
  }

  for (const chapterIndex of indices) {
    if (results.length >= maxResults) break;
    const ch = catalog[chapterIndex];
    if (!ch) continue;

    let plain = '';
    if (
      chapterIndex === start &&
      options?.currentChapterPlain?.trim()
    ) {
      plain = options.currentChapterPlain;
    } else {
      const raw = await readCachedChapterRaw(book.bookUrl, chapterIndex);
      if (!raw?.trim()) continue;
      plain = plainTextForAloud(raw);
    }

    if (!plain) continue;
    searchInText(
      plain,
      trimmed,
      chapterIndex,
      ch.title,
      maxPerChapter,
      results,
      maxResults,
    );
  }

  return results;
}
