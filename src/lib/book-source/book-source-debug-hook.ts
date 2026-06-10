/**
 * 书源调试会话钩子（对齐 Legado Debug.log state 10/20/30/40 缓存 HTML）
 */

export const BOOK_SOURCE_DEBUG_HTML = {
  SEARCH: 10,
  BOOK: 20,
  TOC: 30,
  CONTENT: 40,
} as const;

export type BookSourceDebugHtmlState =
  (typeof BOOK_SOURCE_DEBUG_HTML)[keyof typeof BOOK_SOURCE_DEBUG_HTML];

export type BookSourceDebugHookCallback = (state: number, message: string) => void;

/** 仅缓存 HTML、不展示在日志列表的 state */
export const BOOK_SOURCE_DEBUG_HIDDEN_STATES = new Set<number>([10, 20, 30, 40]);

let activeSourceUrl: string | null = null;
let hookCallback: BookSourceDebugHookCallback | null = null;
let onProgressLog: ((message: string, state?: number) => void) | null = null;

export function enterBookSourceDebugSession(
  sourceUrl: string,
  onLog: BookSourceDebugHookCallback,
  progressLog?: (message: string, state?: number) => void,
): void {
  activeSourceUrl = sourceUrl;
  hookCallback = onLog;
  onProgressLog = progressLog ?? null;
}

export function exitBookSourceDebugSession(): void {
  activeSourceUrl = null;
  hookCallback = null;
  onProgressLog = null;
}

export function isBookSourceDebugSession(sourceUrl: string): boolean {
  return activeSourceUrl === sourceUrl && hookCallback != null;
}

export function emitBookSourceDebugCapture(
  sourceUrl: string,
  state: BookSourceDebugHtmlState,
  html: string,
): void {
  if (!hookCallback || activeSourceUrl !== sourceUrl || !html) return;
  hookCallback(state, html);
}

/** 日志行内 URL / 长文本截断，避免撑破调试面板 */
export function shortenBookSourceDebugText(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function emitBookSourceDebugMessage(
  sourceUrl: string,
  message: string,
  state = 1,
): void {
  if (!activeSourceUrl || activeSourceUrl !== sourceUrl || !message) return;
  const text = shortenBookSourceDebugText(message);
  if (onProgressLog) {
    onProgressLog(text, state);
    return;
  }
  hookCallback?.(state, text);
}
