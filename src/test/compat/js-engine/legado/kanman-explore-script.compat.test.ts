import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BookSource } from '@/types';
import { extractExploreScript, runExploreScript } from '@/lib/js-engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KANMAN_FIXTURE = join(__dirname, '../../../../../examples/看漫画.json');

function loadKanmanSource(): BookSource {
  const raw = JSON.parse(readFileSync(KANMAN_FIXTURE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

describe('kanman @js: exploreUrl', () => {
  it('extractExploreScript 识别 @js: 前缀', () => {
    const source = loadKanmanSource();
    const script = extractExploreScript(source.exploreUrl);
    expect(script).toBeTruthy();
    expect(script).toContain('var result = []');
    expect(script).toContain('JSON.stringify(result)');
  });

  it('runExploreScript 解析分类列表', async () => {
    const source = loadKanmanSource();
    const script = extractExploreScript(source.exploreUrl);
    expect(script).toBeTruthy();
    const sections = await runExploreScript(script!, source);
    expect(sections.length).toBeGreaterThan(1);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('完结');
    expect(titles).toContain('连载');
    const wanjie = sections.find((s) => s.title === '完结');
    expect(wanjie?.url).toMatch(/\/api\/getsortlist\?comic_sort=wanjie/);
    expect(wanjie?.url).toContain('{{page}}');
  });
});
