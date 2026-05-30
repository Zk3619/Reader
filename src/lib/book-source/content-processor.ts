/**
 * 内容处理器
 * 对应 legado 项目的 ContentProcessor.kt
 * 
 * 功能：
 * 1. 应用替换规则到内容
 * 2. 处理图片样式
 * 3. 处理内容净化
 */

import {
  getEnabledRulesByContentScope,
  getEnabledRulesByTitleScope,
} from '@/lib/database/replace-rules';
import type { ReplaceRule } from '@/types';
import { scanImgTags, upsertImgTagStyle } from '@/lib/media/text/scan-img-tags';

/** 对齐 Legado ContentProcessor.upReplaceRules：导入书源后使替换规则缓存失效 */
export function invalidateReplaceRulesCache(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
  }
}

/**
 * 处理正文内容（应用替换规则）
 */
export async function processContent(
  content: string,
  bookName?: string,
  sourceUrl?: string
): Promise<string> {
  if (!content) {
    return content;
  }

  // 获取启用的替换规则（作用于正文）
  const rules = await getEnabledRulesByContentScope(bookName || '', sourceUrl || '');

  // 按顺序应用替换规则
  let processedContent = content;
  for (const rule of rules) {
    processedContent = applyReplaceRule(processedContent, rule);
  }

  return processedContent;
}

/**
 * 处理标题（应用替换规则）
 */
export async function processTitle(
  title: string,
  bookName?: string,
  sourceUrl?: string
): Promise<string> {
  if (!title) {
    return title;
  }

  // 获取启用的替换规则（作用于标题）
  const rules = await getEnabledRulesByTitleScope(bookName || '', sourceUrl || '');

  // 按顺序应用替换规则
  let processedTitle = title;
  for (const rule of rules) {
    processedTitle = applyReplaceRule(processedTitle, rule);
  }

  return processedTitle;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 应用单个替换规则
 */
function applyReplaceRule(text: string, rule: ReplaceRule): string {
  if (!rule.isEnabled || !rule.pattern) {
    return text;
  }

  try {
    // 检查作用范围
    if (rule.scope) {
      // 如果指定了作用范围，需要检查是否匹配
      // 这里简化处理，实际legado会检查bookName和sourceUrl是否匹配scope
      // TODO: 实现完整的作用范围检查
    }

    // 检查排除范围
    if (rule.excludeScope) {
      // 如果指定了排除范围，需要检查是否匹配
      // TODO: 实现完整的排除范围检查
    }

    // 应用替换
    if (rule.isRegex) {
      // 正则表达式替换
      const regex = new RegExp(rule.pattern, 'g');
      return text.replace(regex, rule.replacement || '');
    } else {
      // 普通字符串替换（使用全局正则代替replaceAll以兼容ES2020）
      const regex = new RegExp(escapeRegExp(rule.pattern), 'g');
      return text.replace(regex, rule.replacement || '');
    }
  } catch (error) {
    console.warn(`替换规则执行失败 [${rule.name}]:`, error);
    return text;
  }
}

/**
 * 处理图片样式
 */
export function processImageStyle(
  content: string,
  imageStyle?: string
): string {
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
