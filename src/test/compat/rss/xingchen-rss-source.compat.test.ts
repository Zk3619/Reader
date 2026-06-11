import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveLegadoRuleUrl } from '@/lib/book-source/analyze-search-url';
import { parseAnalyzeUrlOption, splitUrlAndOption } from '@/lib/book-source/analyze-url-option';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/星辰书源.json'), 'utf8'),
)[0] as RssSource;

describe('星辰书源 RSS', () => {
  it('sourceUrl 含 POST AnalyzeUrl 尾缀', () => {
    expect(source.sourceUrl).toContain('/api/no_auth/user,');
    expect(source.sourceUrl).toContain('"method": "POST"');
    expect(source.sourceUrl).toContain('username=link3_');
  });

  it('无 sortUrl 时回退 sourceUrl 并保留 POST 选项', async () => {
    const entries = await parseSortUrls(source);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toContain('"method": "POST"');

    const book = rssAsBookSource(source);
    const fetchUrl = await resolveLegadoRuleUrl(entries[0]!.url, book, {
      page: 1,
      preserveUrlOptions: true,
    });
    const ruleBase = await resolveLegadoRuleUrl(entries[0]!.url, book, {
      page: 1,
      forRuleBase: true,
    });

    expect(fetchUrl).toContain('https://v5.api.link3.cc:5678/api/no_auth/user,');
    expect(fetchUrl).toContain('"method": "POST"');
    expect(fetchUrl).toContain('username=link3_');
    expect(ruleBase).toBe('https://v5.api.link3.cc:5678/api/no_auth/user');
    expect(ruleBase).not.toContain('"method"');

    const { urlPart, optionsJson } = splitUrlAndOption(fetchUrl);
    expect(urlPart).toBe('https://v5.api.link3.cc:5678/api/no_auth/user');
    const option = parseAnalyzeUrlOption(optionsJson);
    expect(option.method).toBe('POST');
    expect(option.body).toContain('username=link3_');
  });
});
