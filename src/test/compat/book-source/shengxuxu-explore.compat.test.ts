import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';
import type { BookSource } from '@/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/shengxuxu-explore.html');

const SOURCE = {
  bookSourceName: 'R 圣墟小说网',
  bookSourceType: 0,
  bookSourceUrl: 'http://www.shengxuxu.net##RosiaPng',
  sourceUrl: 'http://www.shengxuxu.net',
  exploreUrl: '总点击:: /top/allvisit.html',
  header: '{"User-Agent": "Mozilla/5.0 (Linux; Android 9) Mobile Safari/537.36"}',
  ruleExplore: {
    author: '//p[@class="info"]/span[2]/a/text()',
    bookList: '//ul[@class="librarylist"]/li',
    bookUrl: '//p[@class="info"]/span[1]/a/@href',
    name: '//p[@class="info"]/span[1]/a/text()',
  },
} as unknown as BookSource;

describe('shengxuxu explore', () => {
  const html = () => readFileSync(FIXTURE, 'utf8');

  it('xpath on full page extracts book name', () => {
    const out = parseXPath('//p[@class="info"]/span[1]/a/text()', html());
    expect(out.some((x) => x.trim().length > 0)).toBe(true);
  });

  it('parses book fields from gzip-compressed page bytes', async () => {
    const gz = gzipSync(new TextEncoder().encode(html()));
    const decoded = new TextDecoder().decode(
      (await import('@/lib/http/decompress-body')).maybeDecompressHttpBody(gz),
    );
    const items = await analyzeListElements(SOURCE.ruleExplore!.bookList!, {
      content: decoded,
      contentType: 'html',
      baseUrl: 'http://www.shengxuxu.net/top/allvisit.html',
    });
    const name = await analyzeString(SOURCE.ruleExplore!.name!, {
      content: items[0]!.content,
      contentType: 'html',
      baseUrl: 'http://www.shengxuxu.net/top/allvisit.html',
    });
    expect(name.trim().length).toBeGreaterThan(0);
  });

  it('bookList yields li with novelname', async () => {
    const items = await analyzeListElements(SOURCE.ruleExplore!.bookList!, {
      content: html(),
      contentType: 'html',
      baseUrl: 'http://www.shengxuxu.net/top/allvisit.html',
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.content).toMatch(/novelname|class="info"/);
    const name = await analyzeString(SOURCE.ruleExplore!.name!, {
      content: items[0]!.content,
      contentType: 'html',
      baseUrl: 'http://www.shengxuxu.net/top/allvisit.html',
    });
    expect(name.trim().length).toBeGreaterThan(0);
  });
});
