/**
 * 脚本通知解析与统一提示总线（alert/java.toast/toast）
 */

import {
  DEFAULT_TOAST_DURATION,
  dismissScriptNoticeToasts as dismissAllScriptNoticeToasts,
  normalizeScriptToastText,
  showAppToast,
} from '@/components/shared/AppToasts';

export type ScriptNoticeKind = 'rate_limit' | 'info' | 'warning';
export type ScriptNoticeScene =
  | '搜索'
  | '发现'
  | '目录'
  | '详情'
  | '正文'
  | '书源'
  | '登录';

export type ScriptNotice = { kind: ScriptNoticeKind; message: string };

export type ScriptNoticeBus = ReturnType<typeof createScriptNoticeBus>;

/** 命中 rate_limit 时由 fetch 层抛出，业务层可捕获并中止解析 */
export class ScriptNoticeBlockedError extends Error {
  readonly notice: ScriptNotice;

  constructor(notice: ScriptNotice) {
    super(notice.message);
    this.name = 'ScriptNoticeBlockedError';
    this.notice = notice;
  }
}

export function isScriptNoticeBlockedError(error: unknown): error is ScriptNoticeBlockedError {
  return error instanceof ScriptNoticeBlockedError;
}

/** HTML 响应命中限流时消费并返回是否应中断 */
export function consumeHtmlRateLimitNotice(
  bus: ScriptNoticeBus,
  html: string,
  contentType?: 'html' | 'json' | 'text',
): boolean {
  if (contentType && contentType !== 'html') return false;
  const notice = bus.consumeHtmlNotice(html);
  return notice != null && bus.shouldBlockOnNotice(notice);
}

/** 跨请求去抖（source + scene + kind + message） */
const GLOBAL_NOTICE_DEBOUNCE_MS = 1_000;
/** 单次请求内最多展示的不同文案条数（允许多条堆叠，同文案只弹一次） */
const REQUEST_NOTICE_MAX_DISTINCT = 5;
const NOTICE_MAX_CHARS = 120;
const LOGIN_NOTICE_MAX_CHARS = 2000;
const scriptNoticeToastAt = new Map<string, number>();

let scriptNoticeToastSerial = 0;

/** 每条脚本通知独立 id，避免 Sonner 按 id 更新导致「顶替 + 继承剩余时长」 */
export function allocateScriptNoticeToastId(scene: ScriptNoticeScene): string {
  scriptNoticeToastSerial += 1;
  return `reader-script-notice:${scene}:${Date.now()}:${scriptNoticeToastSerial}`;
}

/** 关闭登录弹窗等场景：收起当前所有脚本通知 toast */
export function dismissScriptNoticeToasts(): void {
  dismissAllScriptNoticeToasts();
}

const LOGIN_TOAST_SKIP_RE =
  /^脚本执行|__READER_LEGADO_SUSPEND__|正在打开:|^\[startBrowser\]/i;

function decodeQuotedString(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

export function normalizeScriptNoticeMessage(raw: string, maxChars = NOTICE_MAX_CHARS): string {
  const text = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function isRateLimitMessage(msg: string): boolean {
  return /搜索间隔|搜索过于频繁|请稍后|访问过于频繁|操作过于频繁|间隔|频率过快|频繁操作/i.test(msg);
}

function resolveNoticeKind(msg: string, level?: string): ScriptNoticeKind {
  const normalizedLevel = String(level ?? '').toLowerCase();
  if (isRateLimitMessage(msg)) return 'rate_limit';
  if (normalizedLevel.includes('warn') || /警告|风险|异常|失败|错误/i.test(msg)) {
    return 'warning';
  }
  return 'info';
}

function parseScriptCallNotice(
  html: string,
  patterns: ReadonlyArray<{ kind: 'alert' | 'toast'; re: RegExp }>,
): ScriptNotice | undefined {
  const snippet = html.slice(0, 6000);
  for (const pattern of patterns) {
    const match = pattern.re.exec(snippet);
    const raw = match?.[2]?.trim();
    if (!raw) continue;
    const message = normalizeScriptNoticeMessage(decodeQuotedString(raw));
    if (!message) continue;
    const level = pattern.kind === 'alert' ? 'warning' : undefined;
    return { kind: resolveNoticeKind(message, level), message };
  }
  return undefined;
}

export function parseScriptNoticeFromHtml(html: string): ScriptNotice | undefined {
  const callPatterns = [
    { kind: 'alert' as const, re: /alert\((['"])([\s\S]*?)\1\)/i },
    { kind: 'toast' as const, re: /java\.toast\((['"])([\s\S]*?)\1\)/i },
    { kind: 'toast' as const, re: /(?:^|[^.\w])toast\((['"])([\s\S]*?)\1\)/i },
  ];
  const direct = parseScriptCallNotice(html, callPatterns);
  if (direct) return direct;

  const hasHistoryBack = /(?:window\.)?history\.go\(\s*-\s*1\s*\)/i.test(html.slice(0, 6000));
  if (hasHistoryBack && /搜索|频繁|间隔|稍后/i.test(html.slice(0, 6000))) {
    return { kind: 'rate_limit', message: '请求过于频繁，请稍后重试' };
  }
  return undefined;
}

function normalizeLoginScriptNoticeMessage(raw: string, long?: boolean): string {
  let text = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
  if (!long && !/\n/.test(text)) {
    return normalizeScriptNoticeMessage(text);
  }
  text = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) return '';
  return text.length > LOGIN_NOTICE_MAX_CHARS
    ? `${text.slice(0, LOGIN_NOTICE_MAX_CHARS)}...`
    : text;
}

function shouldSkipLoginScriptToast(raw: string): boolean {
  const t = raw.trim();
  if (!t || t === 'undefined' || t === 'null') return true;
  return LOGIN_TOAST_SKIP_RE.test(t);
}

type EmitScriptNoticeOptions = {
  long?: boolean;
  debounceMessage?: string;
};

type EmittedScriptNoticesInRequest = { messages: Set<string> };

function claimDistinctNoticeInRequest(
  notice: ScriptNotice,
  emittedInRequest: EmittedScriptNoticesInRequest,
): boolean {
  const key = notice.message.slice(0, NOTICE_MAX_CHARS);
  if (emittedInRequest.messages.has(key)) return false;
  if (emittedInRequest.messages.size >= REQUEST_NOTICE_MAX_DISTINCT) return false;
  emittedInRequest.messages.add(key);
  return true;
}

function emitScriptNoticeToast(
  sourceName: string,
  scene: ScriptNoticeScene,
  notice: ScriptNotice,
  emittedInRequest: EmittedScriptNoticesInRequest,
  options?: EmitScriptNoticeOptions,
): void {
  if (!claimDistinctNoticeInRequest(notice, emittedInRequest)) return;
  const debounceKey = `${scene}\0${sourceName}\0${notice.kind}\0${options?.debounceMessage ?? notice.message}`;
  const now = Date.now();
  const last = scriptNoticeToastAt.get(debounceKey) ?? 0;
  if (now - last < GLOBAL_NOTICE_DEBOUNCE_MS) return;
  scriptNoticeToastAt.set(debounceKey, now);

  try {
    const isRateLimit = notice.kind === 'rate_limit';
    const isLoginScene = scene === '登录';
    const multiline = Boolean(options?.long) || notice.message.includes('\n');
    const toastId = allocateScriptNoticeToastId(scene);

    if (isRateLimit) {
      showAppToast({
        title: `${scene}受限 · ${sourceName}`,
        description: notice.message,
        variant: 'warning',
        id: toastId,
        duration: DEFAULT_TOAST_DURATION,
      });
      return;
    }

    const body = multiline ? normalizeScriptToastText(notice.message) : notice.message;
    showAppToast({
      description: isLoginScene ? body : `[${scene}] ${body}`,
      variant: 'plain',
      script: multiline,
      id: toastId,
      duration: DEFAULT_TOAST_DURATION,
    });
  } catch {
    /* ignore toast failure */
  }
}

export function parseRateLimitMessageFromHtml(html: string): string | undefined {
  const notice = parseScriptNoticeFromHtml(html);
  if (notice?.kind === 'rate_limit') return notice.message;
  const plainTextHint = html
    .slice(0, 6000)
    .match(
      /(搜索(?:间隔|过于频繁)|请稍后(?:再)?(?:搜索|重试)|访问过于频繁|操作过于频繁)[^<\n]{0,40}/i,
    )?.[0];
  const normalized = normalizeScriptNoticeMessage(plainTextHint ?? '');
  return normalized && isRateLimitMessage(normalized) ? normalized : undefined;
}

export function createScriptNoticeBus(sourceName: string, scene: ScriptNoticeScene): {
  consumeHtmlNotice: (html: string) => ScriptNotice | undefined;
  onScriptToast: (msg?: unknown, level?: unknown) => void;
  shouldBlockOnNotice: (notice: ScriptNotice) => boolean;
} {
  const emittedInRequest: EmittedScriptNoticesInRequest = { messages: new Set() };

  const normalizeToastNotice = (
    msg?: unknown,
    level?: unknown,
    long?: boolean,
  ): ScriptNotice | undefined => {
    const raw = String(msg ?? '').trim();
    if (!raw || raw === 'undefined' || raw === 'null') return undefined;
    const message =
      scene === '登录'
        ? normalizeLoginScriptNoticeMessage(raw, long)
        : normalizeScriptNoticeMessage(raw);
    if (!message) return undefined;
    return { kind: resolveNoticeKind(message, String(level ?? '')), message };
  };

  const emit = (notice: ScriptNotice, options?: EmitScriptNoticeOptions): void => {
    emitScriptNoticeToast(sourceName, scene, notice, emittedInRequest, options);
  };

  return {
    consumeHtmlNotice(html: string): ScriptNotice | undefined {
      const notice = parseScriptNoticeFromHtml(html);
      if (!notice) return undefined;
      emit(notice);
      return notice;
    },
    onScriptToast(msg?: unknown, level?: unknown): void {
      const levelStr = String(level ?? '').toLowerCase();
      const long = level === true || levelStr === 'long' || levelStr.includes('long');
      const notice = normalizeToastNotice(msg, level, long);
      if (!notice) return;
      emit(notice, { long, debounceMessage: notice.message.slice(0, 120) });
    },
    shouldBlockOnNotice(notice: ScriptNotice): boolean {
      return notice.kind === 'rate_limit';
    },
  };
}

/**
 * 登录脚本专用：对齐 RunLoginScriptOptions.onToast，走同一去抖与 kind 分类。
 */
export function createLoginScriptNoticeBus(sourceName: string): {
  onToast: (message: string, long?: boolean) => void;
  onScriptToast: (msg?: unknown, level?: unknown) => void;
} {
  const bus = createScriptNoticeBus(sourceName, '登录');
  const onToast = (message: string, long?: boolean) => {
    const raw = String(message ?? '').trim();
    if (shouldSkipLoginScriptToast(raw)) return;
    bus.onScriptToast(raw, long ? 'long' : 'info');
  };
  return { onToast, onScriptToast: bus.onScriptToast };
}

export function resolveLoginScriptOnToast(
  source: { sourceName: string },
  onToast?: (message: string, long?: boolean) => void,
): (message: string, long?: boolean) => void {
  return onToast ?? createLoginScriptNoticeBus(source.sourceName).onToast;
}

export async function notifyRateLimitBlocked(
  sourceName: string,
  scene: ScriptNoticeScene,
  message: string,
): Promise<void> {
  const bus = createScriptNoticeBus(sourceName, scene);
  bus.onScriptToast(message, 'warning');
}
