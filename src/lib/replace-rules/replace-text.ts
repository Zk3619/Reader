/**
 * 替换净化规则执行（对齐 Legado RegexExtensions + ContentProcessor）
 */

import { evalJs } from '@/lib/js-engine/quickjs-sandbox';
import { updateReplaceRule } from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import type { Book, BookChapter, ReplaceRule } from '@/types';

/** 对齐 Legado ReplaceBook：@js: 替换脚本中的 book 上下文 */
export interface ReplaceBookContext {
  bookUrl: string;
  origin: string;
  originName: string;
  type: number;
  name: string;
  author: string;
  kind?: string;
  coverUrl?: string;
  intro?: string;
  wordCount?: string;
  latestChapterTitle?: string;
  tocUrl: string;
  originOrder: number;
}

export interface ReplaceRuleRuntimeContext {
  book?: ReplaceBookContext;
  chapter?: BookChapter;
  /** 标题替换：结果为空时保留原文（Legado getDisplayTitle） */
  keepOnBlank?: boolean;
  onRuleDisabled?: (rule: ReplaceRule) => void;
  /** @js: 替换脚本变量（Legado RegexJsExtensions RuleData） */
  ruleVariables?: Record<string, unknown>;
}

export class ReplaceRuleTimeoutError extends Error {
  constructor(public readonly rule: ReplaceRule) {
    super(`替换规则超时: ${rule.name}`);
    this.name = 'ReplaceRuleTimeoutError';
  }
}

/** 对齐 Legado ReplaceRule.isValid */
export function isReplaceRuleValid(rule: Pick<ReplaceRule, 'pattern' | 'isRegex'>): boolean {
  const pattern = rule.pattern?.trim() ?? '';
  if (!pattern) return false;
  if (!rule.isRegex) return true;
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch {
    return false;
  }
  if (pattern.endsWith('|') && !pattern.endsWith('\\|')) {
    return false;
  }
  return true;
}

/** 对齐 Legado String.quoteReplacementJs */
export function quoteReplacementJs(value: string): string {
  if (!value.includes('\\')) return value;
  return value.replace(/\\/g, '\\\\');
}

export function buildReplaceBookContext(book: Book): ReplaceBookContext {
  return {
    bookUrl: book.bookUrl,
    origin: book.origin,
    originName: book.originName,
    type: book.type,
    name: book.name,
    author: book.author,
    kind: book.kind,
    coverUrl: book.coverUrl ?? book.customCoverUrl,
    intro: book.intro ?? book.customIntro,
    wordCount: book.wordCount,
    latestChapterTitle: book.latestChapterTitle,
    tocUrl: book.tocUrl,
    originOrder: book.originOrder ?? 0,
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getValidTimeoutMs(rule: ReplaceRule): number {
  return rule.timeoutMillisecond > 0 ? rule.timeoutMillisecond : 3000;
}

async function evalReplaceJsReplacement(
  script: string,
  matched: string,
  context: ReplaceRuleRuntimeContext,
): Promise<string> {
  const jsResult = await evalJs(script, {
    result: matched,
    baseUrl: context.chapter?.baseUrl ?? context.book?.tocUrl ?? '',
    book: context.book as unknown as Record<string, unknown>,
    chapter: context.chapter as unknown as Record<string, unknown>,
    variables: context.ruleVariables,
    nonBlockingBrowserAwait: true,
  });
  if (jsResult == null) return '';
  return typeof jsResult === 'string' ? jsResult : String(jsResult);
}

/**
 * 逐次匹配替换，支持 @js: 与超时检测（对齐 Legado CharSequence.replace）
 */
export async function applyReplaceRuleToText(
  text: string,
  rule: ReplaceRule,
  context: ReplaceRuleRuntimeContext = {},
): Promise<string> {
  if (!rule.isEnabled || !rule.pattern) return text;
  if (!isReplaceRuleValid(rule)) return text;

  try {
    if (!rule.isRegex) {
      const regex = new RegExp(escapeRegExp(rule.pattern), 'g');
      const next = text.replace(regex, rule.replacement ?? '');
      return applyKeepOnBlank(text, next, context.keepOnBlank);
    }

    const timeoutMs = getValidTimeoutMs(rule);
    const started = Date.now();
    const isJs = rule.replacement.startsWith('@js:');
    const replacementBody = isJs ? rule.replacement.slice(4) : rule.replacement;
    const regex = new RegExp(rule.pattern, 'g');
    /** 对齐 Legado RegexJsExtensions：单条规则多次匹配共享变量 */
    const ruleVariables: Record<string, unknown> = {};
    const jsContext: ReplaceRuleRuntimeContext = {
      ...context,
      ruleVariables,
    };

    let output = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (Date.now() - started > timeoutMs) {
        throw new ReplaceRuleTimeoutError(rule);
      }

      output += text.slice(lastIndex, match.index);
      const matched = match[0];

      let replacement: string;
      if (isJs) {
        const jsResult = await evalReplaceJsReplacement(replacementBody, matched, jsContext);
        replacement = quoteReplacementJs(jsResult);
      } else {
        replacement = matched.replace(new RegExp(rule.pattern), replacementBody);
      }

      output += replacement;
      lastIndex = match.index + matched.length;

      if (matched.length === 0) {
        regex.lastIndex += 1;
      }
    }

    output += text.slice(lastIndex);
    return applyKeepOnBlank(text, output, context.keepOnBlank);
  } catch (error) {
    if (error instanceof ReplaceRuleTimeoutError) {
      const disabled = { ...error.rule, isEnabled: false };
      try {
        await updateReplaceRule(disabled);
        invalidateReplaceRulesCache();
      } catch (e) {
        console.warn('[replace] 禁用超时规则失败', e);
      }
      context.onRuleDisabled?.(disabled);
      console.warn(`[replace] 规则超时已禁用: ${rule.name}`);
      return text;
    }
    console.warn(`替换规则执行失败 [${rule.name}]:`, error);
    return text;
  }
}

function applyKeepOnBlank(original: string, next: string, keepOnBlank?: boolean): string {
  if (keepOnBlank && !next.trim()) return original;
  return next;
}

/** 按顺序应用多条规则；仅当内容变化时视为生效（Legado effectiveReplaceRules） */
export async function applyReplaceRulesToText(
  text: string,
  rules: readonly ReplaceRule[],
  context: ReplaceRuleRuntimeContext = {},
): Promise<{ text: string; effectiveRules: ReplaceRule[] }> {
  let current = text;
  const effectiveRules: ReplaceRule[] = [];

  for (const rule of rules) {
    const before = current;
    current = await applyReplaceRuleToText(current, rule, context);
    if (current !== before) {
      effectiveRules.push(rule);
    }
  }

  return { text: current, effectiveRules };
}

/** 正文替换前按行 trim（Legado ContentProcessor.getContent） */
export function trimContentLinesForReplace(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}
