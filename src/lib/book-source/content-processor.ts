/**
 * 内容处理器
 * 对应 legado 项目的 ContentProcessor.kt
 *
 * 功能：
 * 1. 应用替换规则到正文/标题
 * 2. 处理图片样式
 */

import {
  getEnabledRulesByContentScope,
  getEnabledRulesByTitleScope,
} from '@/lib/database/replace-rules';
import {
  applyReplaceRulesToText,
  buildReplaceBookContext,
  trimContentLinesForReplace,
  type ReplaceBookContext,
} from '@/lib/replace-rules/replace-text';
import type { Book, BookChapter, ReplaceRule } from '@/types';
import { scanImgTags, upsertImgTagStyle } from '@/lib/media/text/scan-img-tags';

type RuleCacheKey = string;

const titleRulesCache = new Map<RuleCacheKey, ReplaceRule[]>();
const contentRulesCache = new Map<RuleCacheKey, ReplaceRule[]>();

function ruleCacheKey(name: string, origin: string): RuleCacheKey {
  return `${name}\0${origin}`;
}

function clearRuleCaches(): void {
  titleRulesCache.clear();
  contentRulesCache.clear();
}

async function getCachedTitleRules(name: string, origin: string): Promise<ReplaceRule[]> {
  const key = ruleCacheKey(name, origin);
  const cached = titleRulesCache.get(key);
  if (cached) return cached;
  const rules = await getEnabledRulesByTitleScope(name, origin);
  titleRulesCache.set(key, rules);
  return rules;
}

async function getCachedContentRules(name: string, origin: string): Promise<ReplaceRule[]> {
  const key = ruleCacheKey(name, origin);
  const cached = contentRulesCache.get(key);
  if (cached) return cached;
  const rules = await getEnabledRulesByContentScope(name, origin);
  contentRulesCache.set(key, rules);
  return rules;
}

/** 对齐 Legado ContentProcessor.upReplaceRules：导入/编辑规则后使缓存失效 */
export function invalidateReplaceRulesCache(): void {
  clearRuleCaches();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
  }
}

export interface ProcessContentOptions {
  book?: Book;
  chapter?: BookChapter;
  /** 标题替换：结果为空时保留原文 */
  keepTitleOnBlank?: boolean;
}

/**
 * 处理正文内容（应用替换规则）
 */
export async function processContent(
  content: string,
  bookName?: string,
  sourceUrl?: string,
  options?: ProcessContentOptions,
): Promise<string> {
  if (!content) return content;

  const name = bookName || '';
  const origin = sourceUrl || '';
  const rules = await getCachedContentRules(name, origin);
  if (rules.length === 0) return content;

  const prepared = trimContentLinesForReplace(content);
  const replaceBook = options?.book ? buildReplaceBookContext(options.book) : undefined;
  const { text } = await applyReplaceRulesToText(prepared, rules, {
    book: replaceBook,
    chapter: options?.chapter,
  });
  return text;
}

/**
 * 处理标题（应用替换规则）
 */
export async function processTitle(
  title: string,
  bookName?: string,
  sourceUrl?: string,
  options?: { book?: Book; chapter?: BookChapter },
): Promise<string> {
  if (!title) return title;

  const name = bookName || '';
  const origin = sourceUrl || '';
  const rules = await getCachedTitleRules(name, origin);
  if (rules.length === 0) return title;

  const normalized = title.replace(/\r\n?/g, '');
  const replaceBook = options?.book ? buildReplaceBookContext(options.book) : undefined;
  const { text } = await applyReplaceRulesToText(normalized, rules, {
    book: replaceBook,
    chapter: options?.chapter,
    keepOnBlank: true,
  });
  return text;
}

/**
 * 处理图片样式
 */
export function processImageStyle(content: string, imageStyle?: string): string {
  if (!content || !imageStyle) {
    return content;
  }

  let styleAttr = '';
  switch (imageStyle.toUpperCase()) {
    case 'FULL':
      styleAttr = 'style="max-width: 100%; height: auto;"';
      break;
    case 'TEXT':
      return content;
    case 'SINGLE':
      styleAttr =
        'style="display: block; margin: 0 auto; max-width: 100%; max-height: 80vh; object-fit: contain;"';
      break;
    case 'CENTER':
    default:
      styleAttr =
        'style="max-width: 100%; height: auto; display: block; margin: 0 auto;"';
  }

  const tags = scanImgTags(content);
  if (tags.length === 0) return content;

  let out = '';
  let lastIndex = 0;
  for (const tag of tags) {
    const idx = content.indexOf(tag, lastIndex);
    if (idx < 0) continue;
    out += content.slice(lastIndex, idx);
    out += upsertImgTagStyle(tag, styleAttr);
    lastIndex = idx + tag.length;
  }
  out += content.slice(lastIndex);
  return out;
}

export type { ReplaceBookContext };
