import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveLegadoRuleUrl } from '@/lib/book-source/analyze-search-url';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { analyzeListElements } from '@/lib/rule-engine/analyze-rule';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/软件分享-难受云.json'), 'utf8'),
)[0] as RssSource;

const warningSortLine =
  (source.sortUrl ?? '').split(/\n/).find((l) => l.includes('注意')) ?? '';
const warningSortUrl = warningSortLine.split('::').slice(1).join('::');

describe('软件分享-难受云 注意分类', () => {
  it('resolveLegadoRuleUrl forRuleBase 保留 wd 明文', async () => {
    const book = rssAsBookSource(source);
    const ruleBase = await resolveLegadoRuleUrl(warningSortUrl, book, {
      forRuleBase: true,
    });
    expect(ruleBase).toContain('♞♞');
    expect(ruleBase).toContain('《');
    expect(ruleBase).not.toContain('%E3%80%8A');
  });

  it('ruleArticles 解析注意分类静态列表', async () => {
    const book = rssAsBookSource(source);
    const fetchUrl = await resolveLegadoRuleUrl(warningSortUrl, book, {
      preserveUrlOptions: true,
    });
    const ruleBaseUrl = await resolveLegadoRuleUrl(warningSortUrl, book, {
      forRuleBase: true,
    });
    expect(fetchUrl).not.toBe(ruleBaseUrl);
    expect(fetchUrl).toContain('%');
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: fetchUrl,
      source: book,
      baseUrl: source.sourceUrl,
    });
    expect(body.length).toBeGreaterThan(1000);

    const items = await analyzeListElements(String(source.ruleArticles), {
      content: body,
      contentType: 'html',
      baseUrl: ruleBaseUrl,
      source: book as unknown as Record<string, unknown>,
    });
    expect(items.length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('编码 fetchUrl 不能作为规则 baseUrl', async () => {
    const book = rssAsBookSource(source);
    const fetchUrl = await resolveLegadoRuleUrl(warningSortUrl, book, {
      preserveUrlOptions: true,
    });
    const ruleBaseUrl = await resolveLegadoRuleUrl(warningSortUrl, book, {
      forRuleBase: true,
    });
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: fetchUrl,
      source: book,
      baseUrl: source.sourceUrl,
    });

    const broken = await analyzeListElements(String(source.ruleArticles), {
      content: body,
      contentType: 'html',
      baseUrl: fetchUrl,
      source: book as unknown as Record<string, unknown>,
    });
    const fixed = await analyzeListElements(String(source.ruleArticles), {
      content: body,
      contentType: 'html',
      baseUrl: ruleBaseUrl,
      source: book as unknown as Record<string, unknown>,
    });
    expect(fixed.length).toBeGreaterThanOrEqual(5);
    expect(broken.length).toBe(0);
  }, 60_000);
});
