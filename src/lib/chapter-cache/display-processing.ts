/**
 * 缓存正文读出后的展示处理（替换规则等）
 */

import { processContent } from '@/lib/book-source/content-processor';
import type { Book, BookSource } from '@/types';

export async function applyChapterDisplayProcessing(
  rawContent: string,
  book: Book,
  source?: BookSource | null,
): Promise<string> {
  if (!rawContent) return rawContent;
  const sourceUrl = source?.sourceUrl ?? book.origin;
  return processContent(rawContent, book.name, sourceUrl);
}
