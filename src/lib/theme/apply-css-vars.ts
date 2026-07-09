import type { ThemeCssVarMap } from '@/lib/theme/types';
import { SEMANTIC_TO_CSS_VAR } from '@/lib/theme/tokens';
import type { SemanticColorTokens } from '@/lib/theme/types';
import type { ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';

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

/** 组件级 CSS 变量 → 对应绘制属性（仅写入变量时预览/壳层不一定会消费） */
const CSS_VAR_CONSUMER_PROPERTIES: Partial<
  Record<string, 'background-color' | 'color' | 'border-color'>
> = {
  '--background': 'background-color',
  '--foreground': 'color',
  '--card': 'background-color',
  '--card-foreground': 'color',
  '--primary': 'background-color',
  '--primary-foreground': 'color',
  '--secondary': 'background-color',
  '--secondary-foreground': 'color',
  '--accent': 'background-color',
  '--accent-foreground': 'color',
  '--destructive': 'background-color',
  '--destructive-foreground': 'color',
  '--muted-foreground': 'color',
  '--popover': 'background-color',
  '--popover-foreground': 'color',
  '--sidebar': 'background-color',
  '--sidebar-foreground': 'color',
  '--sidebar-accent': 'background-color',
  '--sidebar-border': 'border-color',
  '--input': 'border-color',
};

/**
 * Tailwind v4 工具类消费 --color-* 桥接变量（见 app-preview-tokens.css）。
 * 组件 scoped 覆写时须同步写入，否则 text-primary-foreground 等不更新。
 */
const CSS_VAR_TO_TAILWIND_COLOR: Record<string, string> = {
  '--background': '--color-background',
  '--foreground': '--color-foreground',
  '--muted': '--color-muted',
  '--muted-foreground': '--color-muted-foreground',
  '--popover': '--color-popover',
  '--popover-foreground': '--color-popover-foreground',
  '--border': '--color-border',
  '--input': '--color-input',
  '--card': '--color-card',
  '--card-foreground': '--color-card-foreground',
  '--primary': '--color-primary',
  '--primary-foreground': '--color-primary-foreground',
  '--secondary': '--color-secondary',
  '--secondary-foreground': '--color-secondary-foreground',
  '--accent': '--color-accent',
  '--accent-foreground': '--color-accent-foreground',
  '--destructive': '--color-destructive',
  '--destructive-foreground': '--color-destructive-foreground',
  '--info': '--color-info',
  '--info-foreground': '--color-info-foreground',
  '--success': '--color-success',
  '--success-foreground': '--color-success-foreground',
  '--warning': '--color-warning',
  '--warning-foreground': '--color-warning-foreground',
  '--error': '--color-error',
  '--error-foreground': '--color-error-foreground',
  '--ring': '--color-ring',
  '--sidebar': '--color-sidebar',
  '--sidebar-foreground': '--color-sidebar-foreground',
  '--sidebar-accent': '--color-sidebar-accent',
  '--sidebar-accent-foreground': '--color-sidebar-accent-foreground',
  '--sidebar-border': '--color-sidebar-border',
  '--sidebar-ring': '--color-sidebar-ring',
};

/** 仅作为子元素 Token 注入、不绘制到组件宿主上的变量 */
const BUTTON_HOST_CONSUMER_SKIP = new Set([
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--foreground',
  '--input',
  '--ring',
]);

const COMPONENT_HOST_CONSUMER_SKIP: Partial<Record<ThemeComponentId, ReadonlySet<string>>> = {
  button: BUTTON_HOST_CONSUMER_SKIP,
};

function normalizeCssVarName(name: string): string {
  return name.startsWith('--') ? name : `--${name}`;
}

function applyCssVarEntry(
  out: Record<string, string>,
  varName: string,
  value: string,
  skipConsumers?: ReadonlySet<string>,
): void {
  out[varName] = value;
  const hslValue = `hsl(${value})`;
  const colorBridge = CSS_VAR_TO_TAILWIND_COLOR[varName];
  if (colorBridge) {
    out[colorBridge] = hslValue;
  }
  const property = CSS_VAR_CONSUMER_PROPERTIES[varName];
  if (property && !skipConsumers?.has(varName)) {
    out[property] = hslValue;
  }
}

/** 转为 style 对象，并将语义色变量同步映射到 background-color / color 等 */
export function cssVarMapToStyle(
  vars: ThemeCssVarMap,
  options?: { componentId?: ThemeComponentId },
): Record<string, string> {
  const skipConsumers = options?.componentId
    ? COMPONENT_HOST_CONSUMER_SKIP[options.componentId]
    : undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(vars)) {
    if (!value) continue;
    applyCssVarEntry(out, normalizeCssVarName(name), value, skipConsumers);
  }
  return out;
}
