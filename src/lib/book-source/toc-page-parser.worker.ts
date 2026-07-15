import { analyzeListElements, analyzeString, type RuleContext } from '@/lib/rule-engine';
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';
import { enrichJsonListItemContext, readJsonListItemField } from '@/lib/book-source/json-list-context';
import {
  composeLegadoSourceChapterTitle,
  normalizeChapterDataUrl,
  resolveUrl,
} from '@/lib/book-source/utils';
import type { BookChapter, BookSource, TocRule } from '@/types';

type ParseRequest = {
  id: number;
  body: string;
  contentType: 'html' | 'text' | 'json';
  baseUrl: string;
  source: BookSource;
  rule: TocRule;
  listRule: string;
  initRule?: string;
  startIndex: number;
};

type ParseResponse =
  | { id: number; ok: true; chapters: BookChapter[] }
  | { id: number; ok: false; error: string };

function relaxedXPathRule(rule: string): string | undefined {
  const hasAll = /@all$/i.test(rule.trim());
  const body = hasAll ? rule.trim().replace(/@all$/i, '').trim() : rule.trim();
  const xpath = /^@xpath:/i.test(body) ? body.slice(7).trim() : body;
  if (!xpath.startsWith('//') || !/\[\d+\]/.test(xpath)) return undefined;
  const relaxed = xpath.replace(/\[\d+\]/g, '');
  const rebuilt = /^@xpath:/i.test(body) ? `@xpath:${relaxed}` : relaxed;
  return hasAll ? `${rebuilt}@all` : rebuilt;
}

function splitListJsRule(rule: string): string | undefined {
  const close = rule.toLowerCase().lastIndexOf('</js>');
  if (close < 0) return undefined;
  const tail = rule.slice(close + 5).trim();
  return tail || undefined;
}

async function parseChapter(
  rule: TocRule,
  context: RuleContext,
  baseUrl: string,
  index: number,
): Promise<BookChapter | null> {
  let title = rule.chapterName ? await analyzeString(rule.chapterName, context) : '';
  let url = rule.chapterUrl
    ? await analyzeString(rule.chapterUrl, context, { isUrl: true })
    : '';
  url = normalizeChapterDataUrl(url);

  if (!title.trim() && rule.chapterName) {
    title = readJsonListItemField(context, rule.chapterName);
  }
  if (!url.trim() && rule.chapterUrl) {
    url = normalizeChapterDataUrl(readJsonListItemField(context, rule.chapterUrl));
  }

  if (!title && context.result && typeof context.result === 'object' && !Array.isArray(context.result)) {
    const row = context.result as Record<string, unknown>;
    const sourceLabel = String(row.source ?? row.sources ?? '').trim();
    const rowTitle = String(row.title ?? '').trim();
    title = sourceLabel && rowTitle
      ? composeLegadoSourceChapterTitle(sourceLabel, rowTitle)
      : sourceLabel || rowTitle;
  }

  if (!title && url && context.contentType === 'html') {
    for (const fallback of ['a@text', 'a@ownText', '@text']) {
      const value = (await analyzeString(fallback, context)).trim();
      if (value) {
        title = value;
        break;
      }
    }
  }
  if (!title || !url) return null;

  const isVolume = rule.isVolume
    ? Boolean((await analyzeString(rule.isVolume, context)).trim())
    : /^第?[一二三四五六七八九十百千万\d]+[卷部篇]/u.test(title);

  return {
    url: resolveUrl(baseUrl, url),
    title: title.trim(),
    isVolume,
    baseUrl,
    bookUrl: '',
    index,
    isVip: rule.isVip ? Boolean(await analyzeString(rule.isVip, context)) : false,
    isPay: rule.isPay ? Boolean(await analyzeString(rule.isPay, context)) : false,
    wordCount: undefined,
  };
}

async function parsePage(request: ParseRequest): Promise<BookChapter[]> {
  let content = request.body;
  if (request.rule.preUpdateJs?.trim()) {
    const transformed = await analyzeString(request.rule.preUpdateJs, {
      content,
      contentType: request.contentType,
      baseUrl: request.baseUrl,
      result: content,
      source: request.source as unknown as Record<string, unknown>,
    });
    if (transformed.trim()) content = transformed;
  }
  const contentType = content === request.body
    ? request.contentType
    : content.trimStart().startsWith('{') || content.trimStart().startsWith('[')
      ? 'json'
      : request.contentType;
  if (request.initRule?.trim() && contentType === 'json') {
    const initialized = await analyzeString(request.initRule, {
      content,
      contentType,
      baseUrl: request.baseUrl,
      source: request.source as unknown as Record<string, unknown>,
    });
    if (initialized) content = initialized;
  }
  const initializedContentType =
    content.trimStart().startsWith('{') || content.trimStart().startsWith('[')
      ? 'json'
      : contentType;
  const rootContext: RuleContext = {
    content,
    contentType: initializedContentType,
    baseUrl: request.baseUrl,
    source: request.source as unknown as Record<string, unknown>,
  };
  let listRule = request.listRule;
  if (legadoListRuleNeedsAllSuffix(listRule)) listRule = `${listRule}@all`;
  let items = await analyzeListElements(listRule, rootContext);
  if (items.length === 0) {
    const tail = splitListJsRule(listRule);
    if (tail) {
      const tailRule = legadoListRuleNeedsAllSuffix(tail) ? `${tail}@all` : tail;
      items = await analyzeListElements(tailRule, rootContext);
    }
  }
  if (items.length === 0) {
    const relaxed = relaxedXPathRule(listRule);
    if (relaxed) items = await analyzeListElements(relaxed, rootContext);
  }

  const chapters: BookChapter[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const context = enrichJsonListItemContext(
      item.content,
      initializedContentType,
      request.baseUrl,
      request.source as unknown as Record<string, unknown>,
      { regexGroups: item.regexGroups },
    );
    const chapter = await parseChapter(
      request.rule,
      context,
      request.baseUrl,
      request.startIndex + chapters.length,
    );
    if (chapter) chapters.push(chapter);
  }
  return chapters;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  void parsePage(request)
    .then((chapters) => {
      self.postMessage({ id: request.id, ok: true, chapters } satisfies ParseResponse);
    })
    .catch((error) => {
      self.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ParseResponse);
    });
};
