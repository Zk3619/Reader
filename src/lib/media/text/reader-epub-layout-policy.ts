/**
 * EPUB 排版策略（Legado classic EPUB native vs HTML 管线）
 */

import type { Book } from '@/types';
import { isLocalBook } from '@/lib/local-book';

export type EpubLayoutEngine = 'html' | 'epub-native';

/** 是否可走 Legado 式 EPUB 原生排版（Web 端暂为 epubjs HTML + DOM 测量） */
export function resolveEpubLayoutEngine(book: Book | null | undefined): EpubLayoutEngine {
  if (!book || !isLocalBook(book)) return 'html';
  const url = book.bookUrl?.toLowerCase() ?? '';
  if (!url.endsWith('.epub')) return 'html';
  // 预留：classic epub parse mode → canvas 绘制 EpubTextRun
  return 'html';
}

export function epubLayoutEngineLabel(engine: EpubLayoutEngine): string {
  return engine === 'epub-native' ? 'EPUB 原生' : 'EPUB HTML';
}
