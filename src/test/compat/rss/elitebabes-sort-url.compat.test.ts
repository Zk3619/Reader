import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveLegadoRuleUrl } from '@/lib/book-source/analyze-search-url';
import type { RssSource } from '@/types';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { parseSortUrlLines } from '@/lib/rss-source/sort-urls';

const here = dirname(fileURLToPath(import.meta.url));
const sourceJson = JSON.parse(
  readFileSync(join(here, '../../../../examples/EliteBabes.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = sourceJson[0] as unknown as RssSource;

describe('EliteBabes sortUrl 模板', () => {
  it('page=1 展开 Trend 分类为 /sort/trending/', async () => {
    const entries = parseSortUrlLines(String(source.sortUrl), source.sourceUrl);
    const trend = entries.find((e) => e.name === 'Trend');
    expect(trend?.url).toContain('{{');
    const book = rssAsBookSource({
      ...source,
      sourceUrl: 'https://www.elitebabes.com##平静',
    });
    const url = await resolveLegadoRuleUrl(trend!.url, book, { page: 1 });
    expect(url).toBe('https://www.elitebabes.com/sort/trending/');
  });

  it('page=2 展开为 gridapi 分页', async () => {
    const entries = parseSortUrlLines(String(source.sortUrl), source.sourceUrl);
    const trend = entries.find((e) => e.name === 'Trend')!;
    const book = rssAsBookSource({
      ...source,
      sourceUrl: 'https://www.elitebabes.com',
    });
    const url = await resolveLegadoRuleUrl(trend.url, book, { page: 2 });
    expect(url).toContain('/gridapi/?content=updates&sort=trending&mpage=2');
  });
});
