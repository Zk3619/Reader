import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evalSearchUrlExpression, runSearchUrlScript } from '@/lib/book-source/search-script-runner';
import { resolveLegadoRuleUrl } from '@/lib/book-source/analyze-search-url';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { parseSortUrlLines } from '@/lib/rss-source/sort-urls';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/1781199162.json'), 'utf8'),
)[0] as RssSource;

describe('辞晨订阅源 sortUrl getUrl', () => {
  it('sortUrl 含 {{getUrl()}} 模板', () => {
    expect(source.sortUrl).toContain('{{getUrl()}}');
    const entries = parseSortUrlLines(source.sortUrl!, 'http://example.com/');
    expect(entries[0]?.name).toBe('主页');
    expect(entries[0]?.url).toContain('{{getUrl()}}');
  });

  it('runSearchUrlScript getUrl 返回子域', async () => {
    const book = rssAsBookSource(source);
    const out = await runSearchUrlScript('result = getUrl();', book, '', 1);
    expect(out.trim()).toBe('ged520');
  }, 30_000);

  it('evalSearchUrlExpression 加载 jsLib 解析 getUrl', async () => {
    const book = rssAsBookSource(source);
    const subdomain = await evalSearchUrlExpression('getUrl()', book, '', 1);
    expect(subdomain.trim()).not.toBe('');
    expect(subdomain).not.toMatch(/^\./);
    expect(subdomain).toMatch(/^[a-z0-9]+$/i);
  }, 30_000);

  it('resolveLegadoRuleUrl 展开 sortUrl 为有效 http 地址', async () => {
    const book = rssAsBookSource(source);
    const sortUrl = parseSortUrlLines(source.sortUrl!, 'http://example.com/')[0]!.url;
    const resolved = await resolveLegadoRuleUrl(sortUrl, book, {
      page: 1,
      preserveUrlOptions: true,
    });
    expect(resolved).toMatch(/^https?:\/\/[a-z0-9-]+\.yeoi\.me\//i);
    expect(resolved).not.toContain('{{');
    expect(resolved).not.toMatch(/https?:\/\/\.yeoi/);
  }, 30_000);
});
