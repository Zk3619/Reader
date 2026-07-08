import type { ThemeCssVarMap } from '@/lib/theme/types';
import { SEMANTIC_TO_CSS_VAR } from '@/lib/theme/tokens';
import type { SemanticColorTokens } from '@/lib/theme/types';

/** 将语义色板写入元素的 CSS 变量（HSL 分量格式） */
export function applySemanticTokensToElement(
  el: HTMLElement,
  tokens: SemanticColorTokens,
): void {
  for (const [key, cssVar] of Object.entries(SEMANTIC_TO_CSS_VAR)) {
    const value = tokens[key as keyof SemanticColorTokens];
    if (value) el.style.setProperty(cssVar, value);
  }
}

/** 批量写入任意 CSS 变量 */
export function applyCssVarMap(el: HTMLElement, vars: ThemeCssVarMap): void {
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name.startsWith('--') ? name : `--${name}`, value);
  }
}

/** 清除先前通过 applyCssVarMap 写入的内联变量 */
export function clearCssVarMap(el: HTMLElement, varNames: string[]): void {
  for (const name of varNames) {
    el.style.removeProperty(name.startsWith('--') ? name : `--${name}`);
  }
}

/** 转为 React/Solid style 对象（camelCase 键不适用，保留 CSS 变量名） */
export function cssVarMapToStyle(vars: ThemeCssVarMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(vars)) {
    out[name.startsWith('--') ? name : `--${name}`] = value;
  }
  return out;
}
