/**
 * Legado SourceRule.makeUpRule 语义（@get、{{}}、$N、## 替换）
 */

import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';

const EVAL_PATTERN = /@get:\{[^}]+?\}|\{\{[\s\S]*?\}\}/gi;
const REGEX_GROUP_REF = /\$(\d{1,2})/g;

function applyRegexGroupRefs(rule: string, groups?: string[]): string {
  if (!groups?.length || !REGEX_GROUP_REF.test(rule)) return rule;
  REGEX_GROUP_REF.lastIndex = 0;
  return rule.replace(REGEX_GROUP_REF, (_m, idx: string) => {
    const i = parseInt(idx, 10);
    // 对齐 Legado：当捕获组不存在时，保留原 token（而不是吞掉）。
    // SourceRule.makeUpRule 在越界时会回填原始 "$N" 片段。
    const hit = groups[i];
    return hit == null ? `$${idx}` : hit;
  });
}

function applyGetVariablesSync(rule: string, context: RuleContext): string {
  if (!rule.includes('@get:{')) return rule;
  return rule.replace(/@get:\{([^}]+)\}/gi, (_m, key: string) => {
    const k = key.trim();
    const pick = (obj: Record<string, unknown> | undefined, name: string) =>
      obj ? obj[name] : undefined;
    let v = context.variables?.[k];
    if (v == null) v = pick(context.chapter, k);
    if (v == null) v = pick(context.book, k);
    if (v == null) v = pick(context.source, k);
    if (v == null && k.startsWith('chapter.')) v = pick(context.chapter, k.slice(8));
    if (v == null && k.startsWith('book.')) v = pick(context.book, k.slice(5));
    if (v == null && k.startsWith('source.')) v = pick(context.source, k.slice(7));
    return v == null ? '' : String(v);
  });
}

export interface CompileRuleOptions {
  /** 当前正则捕获组（$1/$2 引用） */
  regexGroups?: string[];
  /** 展开 {{}} 内规则表达式 */
  expandTemplate?: (innerRule: string) => Promise<string>;
  /** 展开 {{}} 内 JS */
  expandJs?: (js: string) => Promise<string>;
}

/**
 * 编译规则字符串：展开 @get、{{}}、$N（对齐 Legado SourceRule.makeUpRule）
 */
export async function compileSourceRule(
  rule: string,
  context: RuleContext,
  options: CompileRuleOptions = {},
): Promise<string> {
  if (!rule) return '';

  let working = applyRegexGroupRefs(rule, options.regexGroups ?? context.regexGroups);
  working = applyGetVariablesSync(working, context);

  if (!working.includes('{{')) {
    return working.trim();
  }

  if (!options.expandTemplate || !options.expandJs) {
    throw new Error('compileSourceRule 需要 expandTemplate 与 expandJs');
  }
  const expandTemplate = options.expandTemplate;
  const expandJs = options.expandJs;

  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  EVAL_PATTERN.lastIndex = 0;
  while ((m = EVAL_PATTERN.exec(working)) !== null) {
    out += working.slice(last, m.index);
    const token = m[0];
    if (token.toLowerCase().startsWith('@get:')) {
      out += applyGetVariablesSync(token, context);
    } else {
      const inner = token.slice(2, -2).trim();
      if (inner) {
        if (isRuleExpression(inner)) {
          out += await expandTemplate(inner);
        } else {
          out += await expandJs(inner);
        }
      }
    }
    last = m.index + token.length;
  }
  out += working.slice(last);
  return out.trim();
}

export { stripReplacementTail } from '@/lib/rule-engine/legado-source-rule';
