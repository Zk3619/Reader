import { describe, expect, it, vi } from 'vitest';
import {
  getRssArticleDisplayTitle,
  processRssArticleContentForDisplay,
} from '@/lib/rss-source/rss-content-display-processing';
import type { RssArticle, RssSource } from '@/types';

vi.mock('@/lib/replace-rules/chapter-content-processor', () => ({
  processChapterContentForDisplay: vi.fn(async (raw: string) => ({
    content: `[processed]${raw}`,
    effectiveReplaceRules: [],
    sameTitleRemoved: false,
  })),
}));

vi.mock('@/lib/replace-rules/chapter-display-title', () => ({
  getChapterDisplayTitle: vi.fn(async (title: string) => `[title]${title}`),
}));

vi.mock('@/lib/media/text/read-config-storage', () => ({
  loadReaderUiConfig: vi.fn(async () => ({
    chineseConverterType: 0,
    removeDuplicateTitle: true,
    adaptSpecialStyle: true,
  })),
}));

const source = {
  sourceUrl: 'https://rss.example.com/feed',
  sourceName: '示例 RSS',
} as RssSource;

const article = {
  title: '文章标题',
  link: 'https://rss.example.com/a/1',
  origin: 'https://rss.example.com',
} as RssArticle;

describe('processRssArticleContentForDisplay', () => {
  it('delegates to chapter display processor', async () => {
    const out = await processRssArticleContentForDisplay('<p>正文</p>', source, article);
    expect(out).toBe('[processed]<p>正文</p>');
  });
});

describe('getRssArticleDisplayTitle', () => {
  it('delegates to getChapterDisplayTitle', async () => {
    const out = await getRssArticleDisplayTitle(source, article);
    expect(out).toBe('[title]文章标题');
  });
});
