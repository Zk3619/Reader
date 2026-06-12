/**
 * 章节正文展示处理流水线（对齐 Legado ContentProcessor.getContent）
 *
 * 顺序：去重复标题 → 重新分段 → 简繁转换 → 特殊 HTML 占位 → 替换净化 → 还原 HTML
 */

import {
  getEnabledRulesByContentScope,
} from '@/lib/database/replace-rules';
import {
  applyReplaceRulesToText,
  buildReplaceBookContext,
  trimContentLinesForReplace,
} from '@/lib/replace-rules/replace-text';
import { removeDuplicateChapterTitle } from '@/lib/replace-rules/remove-duplicate-chapter-title';
import {
  isSameTitleRemovalCached,
  markSameTitleRemovalCached,
} from '@/lib/replace-rules/remove-same-title-cache';
import {
  isAdaptSpecialStyleEnabled,
  restoreUseHtmlBlocks,
  shieldUseHtmlBlocks,
} from '@/lib/replace-rules/adapt-special-style';
import { reSegmentContent } from '@/lib/replace-rules/content-resegment';
import {
  convertChineseText,
  isChineseConverterEnabled,
  type ChineseConverterType,
} from '@/lib/replace-rules/chinese-converter';
import {
  isReSegmentEnabledForBook,
  isReplaceRuleEnabledForBook,
} from '@/lib/replace-rules/replace-rule-policy';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { showAppToast } from '@/components/shared/AppToasts';
import type { Book, BookChapter, BookSource, ReplaceRule } from '@/types';

export interface ProcessChapterContentOptions {
  /** 阅读器 UI 配置 */
  uiConfig?: Pick<
    TextViewerUiConfig,
    'adaptSpecialStyle' | 'chineseConverterType' | 'removeDuplicateTitle'
  >;
  /** 跳过全部处理 */
  skip?: boolean;
  /** 覆盖：是否应用替换规则（导出时可关） */
  useReplace?: boolean;
  /** 覆盖：是否重新分段（导出时 Legado 为 false） */
  reSegment?: boolean;
  /** 覆盖：是否简繁转换（导出时 Legado 为 false） */
  chineseConvert?: boolean;
  /** 覆盖：是否去除重复标题 */
  removeDuplicateTitle?: boolean;
  /** EPUB 导出等：强制首行去标题（对齐 Legado forceRemoveTitle） */
  forceRemoveTitle?: boolean;
}

export interface ProcessChapterContentResult {
  content: string;
  effectiveReplaceRules: ReplaceRule[];
  sameTitleRemoved: boolean;
}

export {
  isReSegmentEnabledForBook,
  isReplaceRuleEnabledForBook,
} from '@/lib/replace-rules/replace-rule-policy';

let contentRulesCacheKey = '';
let contentRulesCache: ReplaceRule[] = [];

function invalidateContentRulesCache(): void {
  contentRulesCacheKey = '';
  contentRulesCache = [];
}

if (typeof window !== 'undefined') {
  window.addEventListener('replace-rules-refresh', invalidateContentRulesCache);
}

async function getContentRules(name: string, origin: string): Promise<ReplaceRule[]> {
  const key = `${name}\0${origin}`;
  if (key === contentRulesCacheKey) return contentRulesCache;
  contentRulesCache = await getEnabledRulesByContentScope(name, origin);
  contentRulesCacheKey = key;
  return contentRulesCache;
}

function resolveChineseConverterType(
  options?: ProcessChapterContentOptions,
): ChineseConverterType {
  return (
    options?.uiConfig?.chineseConverterType ??
    defaultTextViewerUiConfig.chineseConverterType ??
    0
  ) as ChineseConverterType;
}

function resolveRemoveDuplicateTitle(options?: ProcessChapterContentOptions): boolean {
  if (options?.removeDuplicateTitle != null) return options.removeDuplicateTitle;
  return options?.uiConfig?.removeDuplicateTitle !== false;
}

/**
 * 对缓存 raw 正文做展示期处理（替换净化及相关 Legado 行为）
 */
export async function processChapterContentForDisplay(
  rawContent: string,
  book: Book,
  source: BookSource | null | undefined,
  chapter: BookChapter | null | undefined,
  options?: ProcessChapterContentOptions,
): Promise<ProcessChapterContentResult> {
  const empty: ProcessChapterContentResult = {
    content: rawContent,
    effectiveReplaceRules: [],
    sameTitleRemoved: false,
  };
  if (!rawContent || options?.skip) return empty;

  let content = rawContent;
  let sameTitleRemoved = false;
  const sourceUrl = source?.sourceUrl ?? book.origin;
  const useReplace =
    options?.useReplace ?? isReplaceRuleEnabledForBook(book);
  const shouldReSegment =
    options?.reSegment ?? (chapter != null && isReSegmentEnabledForBook(book));
  const chineseType = resolveChineseConverterType(options);
  const shouldChineseConvert =
    options?.chineseConvert ??
    (isChineseConverterEnabled(chineseType) ? true : false);
  const shouldRemoveDuplicateTitle = resolveRemoveDuplicateTitle(options);

  if (chapter && shouldRemoveDuplicateTitle) {
    const chapterIndex = chapter.index ?? 0;
    if (!isSameTitleRemovalCached(book.bookUrl, chapterIndex)) {
      const removed = await removeDuplicateChapterTitle(content, book, chapter, {
        useReplaceRule: useReplace,
        forceRemoveTitle: options?.forceRemoveTitle === true,
      });
      content = removed.content;
      sameTitleRemoved = removed.removed;
      markSameTitleRemovalCached(book.bookUrl, chapterIndex);
    }
  }

  if (chapter && shouldReSegment) {
    content = reSegmentContent(content, chapter.title);
  }

  if (shouldChineseConvert && isChineseConverterEnabled(chineseType)) {
    try {
      content = await convertChineseText(content, chineseType);
    } catch (e) {
      console.warn('[replace] 简繁转换失败', e);
    }
  }

  let htmlPlaceholders = new Map<string, string>();
  if (isAdaptSpecialStyleEnabled(options?.uiConfig)) {
    const shielded = shieldUseHtmlBlocks(content);
    content = shielded.text;
    htmlPlaceholders = shielded.placeholders;
  }

  let effectiveReplaceRules: ReplaceRule[] = [];
  const replaceErrors: string[] = [];
  if (useReplace) {
    const rules = await getContentRules(book.name, sourceUrl);
    if (rules.length > 0) {
      const prepared = trimContentLinesForReplace(content);
      const replaceBook = buildReplaceBookContext(book);
      const result = await applyReplaceRulesToText(prepared, rules, {
        book: replaceBook,
        chapter: chapter ?? undefined,
        onRuleDisabled: (rule) => {
          const detail = `${rule.name}\n${rule.pattern}`;
          replaceErrors.push(`【替换规则超时】${detail}\n已自动禁用该规则`);
          showAppToast({
            title: '替换规则超时',
            description: `${rule.name} 已自动禁用`,
            variant: 'destructive',
          });
        },
      });
      content = result.text;
      effectiveReplaceRules = result.effectiveRules;
      if (replaceErrors.length > 0) {
        content = `${content}\n\n${replaceErrors.join('\n\n')}`;
      }
    }
  }

  if (htmlPlaceholders.size > 0) {
    content = restoreUseHtmlBlocks(content, htmlPlaceholders);
  }

  if (content.includes('\u00a0')) {
    content = content.replace(/\u00a0/g, ' ');
  }

  return { content, effectiveReplaceRules, sameTitleRemoved };
}
