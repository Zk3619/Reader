import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine';
import { getExploreSections } from '@/lib/book-source';
import type { BookSource } from '@/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/tuku');
const SOURCE_FIXTURE = join(__dirname, '../../../../examples/图库漫画.json');

function loadSource(): BookSource {
  const raw = JSON.parse(readFileSync(SOURCE_FIXTURE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('tuku 图库漫画', () => {
  const source = loadSource();
  const exploreHtml = () => loadFixture('tmp-tuku-explore.html');
  const searchHtml = () => loadFixture('tmp-tuku-search.html');
  const detailHtml = () => loadFixture('tmp-tuku-detail.html');
  const baseUrl = 'https://www.tuku.cc/comics-region1-tag1-status1-p1/';

  it('getExploreSections 解析 JSON exploreUrl', () => {
    const sections = getExploreSections(source);
    expect(sections.length).toBeGreaterThan(10);
    expect(sections.some((s) => s.title === '热血-港台' && s.url?.includes('region1-tag1'))).toBe(true);
    expect(sections.filter((s) => s.url?.trim()).length).toBeGreaterThan(0);
  });

  it('explore bookList 能列出书籍', async () => {
    const rule = source.ruleExplore!;
    const items = await analyzeListElements(rule.bookList!, {
      content: exploreHtml(),
      contentType: 'html',
      baseUrl,
    });
    expect(items.length).toBeGreaterThan(0);
    const ctx = { content: items[0]!.content, contentType: 'html' as const, baseUrl };
    const name = await analyzeString(rule.name!, ctx);
    const bookUrl = await analyzeString(rule.bookUrl!, ctx, { isUrl: true });
    expect(name.trim().length).toBeGreaterThan(0);
    expect(bookUrl).toMatch(/\/manga-\d+/);
  });

  it('search bookList 能列出书籍', async () => {
    const rule = source.ruleSearch!;
    const items = await analyzeListElements(rule.bookList!, {
      content: searchHtml(),
      contentType: 'html',
      baseUrl: 'https://www.tuku.cc/search?title=test',
    });
    expect(items.length).toBeGreaterThan(0);
    const ctx = {
      content: items[0]!.content,
      contentType: 'html' as const,
      baseUrl: 'https://www.tuku.cc/search?title=test',
    };
    const name = await analyzeString(rule.name!, ctx);
    const bookUrl = await analyzeString(rule.bookUrl!, ctx, { isUrl: true });
    expect(name.trim().length).toBeGreaterThan(0);
    expect(bookUrl).toMatch(/\/manga-\d+/);
  });

  it('toc chapterList 能列出章节', async () => {
    const rule = source.ruleToc!;
    const items = await analyzeListElements(rule.chapterList!, {
      content: detailHtml(),
      contentType: 'html',
      baseUrl: 'https://www.tuku.cc/manga-50781/',
    });
    expect(items.length).toBeGreaterThan(0);
    const ctx = {
      content: items[0]!.content,
      contentType: 'html' as const,
      baseUrl: 'https://www.tuku.cc/manga-50781/',
    };
    const chapterName = await analyzeString(rule.chapterName!, ctx);
    const chapterUrl = await analyzeString(rule.chapterUrl!, ctx, { isUrl: true });
    expect(chapterName.trim().length).toBeGreaterThan(0);
    expect(chapterUrl).toMatch(/\/chapter\d+/);
  });
});
