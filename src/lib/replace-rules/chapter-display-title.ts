/**
 * 章节标题展示（对齐 Legado BookChapter.getDisplayTitle）
 */

import { processTitle } from '@/lib/book-source/content-processor';
import { formatTocChapterDisplayTitle } from '@/lib/catalog/chapter-list-layout';
import {
  convertChineseText,
  isChineseConverterEnabled,
  type ChineseConverterType,
} from '@/lib/replace-rules/chinese-converter';
import { isReplaceRuleEnabledForBook } from '@/lib/replace-rules/replace-rule-policy';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { BookChapter } from '@/types';
import type { ReplacePolicyBook } from '@/lib/replace-rules/replace-rule-policy';

async function applyTitlePostProcess(
  title: string,
  chineseType: ChineseConverterType,
): Promise<string> {
  if (!title || !isChineseConverterEnabled(chineseType)) return title;
  try {
    return await convertChineseText(title, chineseType);
  } catch {
    return title;
  }
}

export async function getChapterDisplayTitle(
  title: string | undefined,
  book: ReplacePolicyBook,
  sourceUrl?: string | null,
  fallbackIndex?: number,
  uiConfig?: Pick<TextViewerUiConfig, 'chineseConverterType'>,
): Promise<string> {
  const chineseType =
    (uiConfig?.chineseConverterType ??
      defaultTextViewerUiConfig.chineseConverterType ??
      0) as ChineseConverterType;
  let base = formatTocChapterDisplayTitle(title, fallbackIndex);
  if (!base) return base;
  if (isReplaceRuleEnabledForBook(book)) {
    const origin = sourceUrl ?? book.origin;
    base = await processTitle(base, book.name, origin);
  }
  return applyTitlePostProcess(base, chineseType);
}

export async function buildChapterDisplayTitleMap(
  chapters: readonly BookChapter[],
  book: ReplacePolicyBook,
  sourceUrl?: string | null,
  options?: {
    useReplace?: boolean;
    uiConfig?: Pick<TextViewerUiConfig, 'chineseConverterType'>;
  },
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const chineseType =
    (options?.uiConfig?.chineseConverterType ??
      defaultTextViewerUiConfig.chineseConverterType ??
      0) as ChineseConverterType;
  const origin = sourceUrl ?? book.origin;
  const useReplace = options?.useReplace ?? isReplaceRuleEnabledForBook(book);

  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    let base = formatTocChapterDisplayTitle(chapter?.title, index);
    if (base && useReplace) {
      base = await processTitle(base, book.name, origin);
    }
    if (base) {
      base = await applyTitlePostProcess(base, chineseType);
    }
    map.set(index, base);
  }
  return map;
}
