/**
 * RSS 正文展示处理（对齐 Legado ContentProcessor + 阅读器 display pipeline）
 */

import { processChapterContentForDisplay } from '@/lib/replace-rules/chapter-content-processor';
import { getChapterDisplayTitle } from '@/lib/replace-rules/chapter-display-title';
import { loadReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { getReplaceEnableDefault } from '@/lib/replace-rules/replace-rule-policy';
import { BookType } from '@/lib/book-source/book-type';
import type { Book, BookChapter, RssArticle, RssSource } from '@/types';

function buildRssVirtualBook(source: RssSource): Book {
  const url = source.sourceUrl.trim();
  return {
    bookUrl: url,
    tocUrl: url,
    origin: url,
    originName: source.sourceName,
    name: source.sourceName,
    author: '',
    kind: '',
    type: BookType.text,
    readConfig: {
      useReplaceRule:
        typeof source.useReplaceRule === 'boolean'
          ? source.useReplaceRule
          : getReplaceEnableDefault(),
      reSegment: source.reSegment === true,
    },
  } as Book;
}

function buildRssVirtualChapter(article: RssArticle): BookChapter {
  return {
    url: article.link,
    title: article.title,
    baseUrl: article.origin || '',
    index: article.order ?? 0,
  } as BookChapter;
}

async function readerDisplayUiConfigForRss() {
  const saved = await loadReaderUiConfig();
  const cfg = { ...defaultTextViewerUiConfig, ...saved };
  return {
    adaptSpecialStyle: cfg.adaptSpecialStyle,
    chineseConverterType: cfg.chineseConverterType,
    removeDuplicateTitle: cfg.removeDuplicateTitle,
  };
}

/** RSS 文章标题展示（对齐阅读器 getChapterDisplayTitle） */
export async function getRssArticleDisplayTitle(
  source: RssSource,
  article: RssArticle,
): Promise<string> {
  const book = buildRssVirtualBook(source);
  const uiConfig = await readerDisplayUiConfigForRss();
  const display = await getChapterDisplayTitle(
    article.title,
    book,
    source.sourceUrl,
    article.order ?? 0,
    uiConfig,
  );
  return display || article.title;
}

/** 对 RSS ruleContent 解析结果应用与阅读器一致的展示处理 */
export async function processRssArticleContentForDisplay(
  rawContent: string,
  source: RssSource,
  article: RssArticle,
): Promise<string> {
  if (!rawContent?.trim()) return rawContent;

  const book = buildRssVirtualBook(source);
  const chapter = buildRssVirtualChapter(article);
  const uiConfig = await readerDisplayUiConfigForRss();

  const result = await processChapterContentForDisplay(
    rawContent,
    book,
    null,
    chapter,
    { uiConfig },
  );
  return result.content;
}
