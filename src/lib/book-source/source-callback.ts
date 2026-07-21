/**
 * 书源事件回调（精简对齐 Legado SourceCallBack）
 * 门闩：source.eventListener；脚本：ruleContent.callBackJs
 */

import { evalJs } from '@/lib/js-engine';
import { unwrapLegadoJsSnippet } from '@/lib/rule-engine/legado-source-rule';
import type { Book, BookChapter, BookSource } from '@/types';

/** 本阶段支持的事件子集 */
export const SourceCallbackEvent = {
  ADD_BOOK_SHELF: 'addBookShelf',
  DEL_BOOK_SHELF: 'delBookShelf',
  START_READ: 'startRead',
  END_READ: 'endRead',
  CLICK_CUSTOM_BUTTON: 'clickCustomButton',
} as const;

export type SourceCallbackEventName =
  (typeof SourceCallbackEvent)[keyof typeof SourceCallbackEvent];

function isTruthyJsResult(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (!s) return false;
  return s !== 'false' && s !== '0' && s !== 'null' && s !== 'undefined';
}

function bookToJsFace(book: Book): Record<string, unknown> {
  return {
    name: book.name,
    author: book.author,
    bookUrl: book.bookUrl,
    tocUrl: book.tocUrl,
    origin: book.origin,
    originName: book.originName,
    coverUrl: book.coverUrl,
    intro: book.intro,
    type: book.type,
    durChapterIndex: book.durChapterIndex,
    durChapterPos: book.durChapterPos,
    durChapterTitle: book.durChapterTitle,
  };
}

function chapterToJsFace(chapter: BookChapter | null | undefined): Record<string, unknown> | null {
  if (!chapter) return null;
  return {
    url: chapter.url,
    title: chapter.title,
    index: chapter.index,
    baseUrl: chapter.baseUrl,
  };
}

function sourceToJsFace(source: BookSource): Record<string, unknown> {
  return {
    bookSourceUrl: source.bookSourceUrl ?? source.sourceUrl,
    bookSourceName: source.sourceName,
    bookSourceType: source.bookSourceType,
    sourceUrl: source.sourceUrl,
    sourceName: source.sourceName,
  };
}

async function evalCallBackJs(
  source: BookSource,
  jsStr: string,
  event: string,
  book: Book | null,
  chapter: BookChapter | null | undefined,
  result: string | null | undefined,
): Promise<unknown> {
  const body = unwrapLegadoJsSnippet(jsStr);
  // 对齐 Legado put("event", …)：在脚本前注入全局 event
  const code = `var event = ${JSON.stringify(event)};\n${body}`;
  return evalJs(code, {
    result: result ?? null,
    baseUrl: book?.bookUrl || source.sourceUrl || '',
    book: book ? bookToJsFace(book) : undefined,
    chapter: chapterToJsFace(chapter) ?? undefined,
    source: sourceToJsFace(source),
    bookSource: source,
  });
}

export type CallBackBtnOptions = {
  source: BookSource | null | undefined;
  book: Book;
  chapter?: BookChapter | null;
  bookType?: number;
  result?: string | null;
  /** 脚本未拦截（返回 falsy）或未启用时调用，用于继续默认行为 */
  noCall?: () => void | Promise<void>;
};

/**
 * 按钮类回调：脚本返回 truthy 表示已处理（拦截默认）；否则走 noCall。
 * 对齐 Legado SourceCallBack.callBackBtn
 */
export async function callBackBtn(
  event: SourceCallbackEventName | string,
  options: CallBackBtnOptions,
): Promise<boolean> {
  const { source, book, chapter, result, noCall } = options;
  if (!source?.eventListener) {
    await noCall?.();
    return false;
  }
  const jsStr = source.ruleContent?.callBackJs?.trim();
  if (!jsStr) {
    await noCall?.();
    return false;
  }
  try {
    const out = await evalCallBackJs(source, jsStr, event, book, chapter, result);
    if (!isTruthyJsResult(out)) {
      await noCall?.();
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[source-callback] ${source.sourceName} 回调事件 ${event} 失败:`,
      e,
    );
    await noCall?.();
    return false;
  }
}

/**
 * 书籍生命周期回调（加架/开读等）：仅触发，不拦截。
 * 对齐 Legado SourceCallBack.callBackBook
 */
export async function callBackBook(
  event: SourceCallbackEventName | string,
  source: BookSource | null | undefined,
  book: Book | null | undefined,
  chapter?: BookChapter | null,
  result?: string | null,
): Promise<void> {
  if (!source?.eventListener || !book) return;
  const jsStr = source.ruleContent?.callBackJs?.trim();
  if (!jsStr) return;
  try {
    await evalCallBackJs(source, jsStr, event, book, chapter, result);
  } catch (e) {
    console.warn(
      `[source-callback] ${source.sourceName} 回调事件 ${event} 失败:`,
      e,
    );
  }
}

/** 自定义按钮点击（需同时开启 customButton + eventListener） */
export async function clickCustomButton(
  source: BookSource | null | undefined,
  book: Book,
  chapter?: BookChapter | null,
): Promise<boolean> {
  if (!source?.customButton) return false;
  return callBackBtn(SourceCallbackEvent.CLICK_CUSTOM_BUTTON, {
    source,
    book,
    chapter,
  });
}
