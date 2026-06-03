import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import { parseCss, isValidCssSelector } from '@/lib/rule-engine/css-parser';
import type { BookSource } from '@/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHENGXUXU_FIXTURE = join(__dirname, '../../fixtures/shengxuxu-book-2924.html');
const KANMAN_FIXTURE = join(__dirname, '../../fixtures/kanman-book-info.html');
const KANMAN_SOURCE_FIXTURE = join(__dirname, '../../../../examples/看漫画.json');

const META_RULES = {
  author: 'meta[property="og:novel:author"]@content',
  name: 'meta[property="og:novel:book_name"]@content',
  kind: 'meta[property="og:novel:category"]@content',
  lastChapter: 'meta[property="og:novel:latest_chapter_name"]@content',
  coverUrl: 'meta[property="og:image"]@content',
};

function loadKanmanSource(): BookSource {
  const raw = JSON.parse(readFileSync(KANMAN_SOURCE_FIXTURE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

describe('meta og:novel property selectors', () => {
  const html = () => readFileSync(SHENGXUXU_FIXTURE, 'utf8');
  const kanmanHtml = () => readFileSync(KANMAN_FIXTURE, 'utf8');

  it('isValidCssSelector accepts og:novel attribute selector', () => {
    expect(isValidCssSelector('meta[property="og:novel:author"]')).toBe(true);
    expect(isValidCssSelector("meta[property='og:novel:author']")).toBe(true);
  });

  it('parseCss extracts og:novel meta content', () => {
    expect(parseCss(META_RULES.author, html())).toEqual(['蝴蝶蓝']);
    expect(parseCss(META_RULES.name, html())).toEqual(['全职高手番外之巅峰荣耀']);
    expect(parseCss(META_RULES.kind, html())).toEqual(['游戏']);
    expect(parseCss(META_RULES.lastChapter, html())).toEqual(['第二十三章 黄金一代']);
  });

  it('analyzeString resolves og:novel meta fields', async () => {
    const ctx = {
      content: html(),
      contentType: 'html' as const,
      baseUrl: 'http://www.shengxuxu.net/2924/',
    };
    await expect(analyzeString(META_RULES.author, ctx)).resolves.toBe('蝴蝶蓝');
    await expect(analyzeString(META_RULES.name, ctx)).resolves.toBe('全职高手番外之巅峰荣耀');
  });

  it('看漫画 ruleBookInfo 解析 og:novel meta（双引号/单引号规则）', async () => {
    const source = loadKanmanSource();
    const rule = source.ruleBookInfo!;
    const ctx = {
      content: kanmanHtml(),
      contentType: 'html' as const,
      baseUrl: 'https://www.kanman.com/12345/',
    };
    expect(await analyzeString(rule.author!, ctx)).toBe('飒飒动漫');
    expect(await analyzeString(rule.name!, ctx)).toBe('测试漫画名');
    expect(await analyzeString(rule.kind!, ctx)).toBe('热血');
    expect(await analyzeString(rule.lastChapter!, ctx)).toBe('第100话');
    expect(await analyzeString(rule.coverUrl!, ctx, { isUrl: true })).toBe(
      'https://image.yqmh.com/mh/12345.jpg',
    );
    expect(await analyzeString("meta[property='og:novel:author']@content", ctx)).toBe('飒飒动漫');
  });

  it('meta 未命中时不泄漏 body 文本', () => {
    const bodyOnly = '<html><body><p>站点导航</p></body></html>';
    expect(parseCss(META_RULES.author, bodyOnly)).toEqual([]);
  });
});
