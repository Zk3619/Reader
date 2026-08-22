/**
 * 界面字体栈：始终附带彩色 Emoji 字体，避免中文字体 cmap 占位导致 □ 方框。
 */

/** 跨平台彩色 Emoji（须排在可能错误声明 Emoji 覆盖范围的中文字体之前） */
export const UI_EMOJI_FONT_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

export const UI_SANS_FALLBACK_STACK = 'ui-sans-serif, system-ui, sans-serif';

const EMOJI_STACK_HINT = /Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji/i;

export function quoteCssFontFamily(name: string): string {
  const safe = name.replace(/["']/g, '').trim();
  if (!safe) return '';
  return /[\s,]/.test(safe) ? `"${safe}"` : safe;
}

/**
 * 组装 --font-sans / font-family。
 * - 单字体名：Emoji 前置 + 主字体 + 系统回退
 * - 已是多字体栈：若缺 Emoji 则前置补齐
 */
export function composeSansFontStack(primary?: string | null): string {
  const raw = (primary ?? '').trim();
  if (!raw) {
    return `${UI_EMOJI_FONT_STACK}, ${UI_SANS_FALLBACK_STACK}`;
  }
  if (raw.includes(',')) {
    return EMOJI_STACK_HINT.test(raw) ? raw : `${UI_EMOJI_FONT_STACK}, ${raw}`;
  }
  const quoted = quoteCssFontFamily(raw);
  if (!quoted) {
    return `${UI_EMOJI_FONT_STACK}, ${UI_SANS_FALLBACK_STACK}`;
  }
  return `${UI_EMOJI_FONT_STACK}, ${quoted}, ${UI_SANS_FALLBACK_STACK}`;
}
