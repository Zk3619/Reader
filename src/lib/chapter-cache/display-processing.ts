/**
 * 缓存正文读出后的展示处理（替换净化等，对齐 Legado ContentProcessor）
 */

import {
  processChapterContentForDisplay,
  type ProcessChapterContentResult,
} from '@/lib/replace-rules/chapter-content-processor';
import type { ProcessChapterContentOptions } from '@/lib/replace-rules/chapter-content-processor';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { Book, BookChapter, BookSource } from '@/types';

export {
  isReplaceRuleEnabledForBook,
  isReSegmentEnabledForBook,
} from '@/lib/replace-rules/chapter-content-processor';

export async function applyChapterDisplayProcessingWithMeta(
  rawContent: string,
  book: Book,
  source?: BookSource | null,
  chapter?: BookChapter | null,
  uiConfig?: Pick<
    TextViewerUiConfig,
    'adaptSpecialStyle' | 'chineseConverterType' | 'removeDuplicateTitle'
  >,
  processingOptions?: Omit<ProcessChapterContentOptions, 'uiConfig'>,
): Promise<ProcessChapterContentResult> {
  if (!rawContent) {
    return { content: rawContent, effectiveReplaceRules: [], sameTitleRemoved: false };
  }
  return processChapterContentForDisplay(rawContent, book, source, chapter, {
    uiConfig,
    ...processingOptions,
  });
}

export async function applyChapterDisplayProcessing(
  rawContent: string,
  book: Book,
  source?: BookSource | null,
  chapter?: BookChapter | null,
  uiConfig?: Pick<
    TextViewerUiConfig,
    'adaptSpecialStyle' | 'chineseConverterType' | 'removeDuplicateTitle'
  >,
  processingOptions?: Omit<ProcessChapterContentOptions, 'uiConfig'>,
): Promise<string> {
  const result = await applyChapterDisplayProcessingWithMeta(
    rawContent,
    book,
    source,
    chapter,
    uiConfig,
    processingOptions,
  );
  return result.content;
}
