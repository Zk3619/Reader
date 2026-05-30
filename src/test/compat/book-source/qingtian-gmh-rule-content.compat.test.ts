import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readProjectFile } from '@/test/helpers/fixtures';
import type { BookSource } from '@/types';

const IMG13 =
  '<img src="https://cdn.example/1.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/2.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/3.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/4.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/5.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/6.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/7.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/8.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/9.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/10.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/11.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/12.webp,{"headers":{}}">' +
  '<img src="https://cdn.example/13.webp,{"headers":{}}">';

vi.mock('@/lib/http', () => ({
  get: vi.fn(async () => ''),
  post: vi.fn(async () =>
    JSON.stringify({
      code: 0,
      content: IMG13,
    }),
  ),
}));

function loadQingtianSource(): BookSource {
  const sources = JSON.parse(readProjectFile('examples/shareBookSource(1).json')) as BookSource[];
  const source = sources.find((s) => s.bookSourceName?.includes('晴天'));
  if (!source) throw new Error('未找到晴天书源');
  return source;
}

function buildGmhChapterHex(): string {
  const payload = {
    item_id: 'MzI3MDdfMTc2MDY2Mg',
    sources: 'G社漫画',
    tab: '漫画',
    title: '001话：背叛？重生！',
    book_id: '32707',
    url: '',
  };
  return Array.from(new TextEncoder().encode(JSON.stringify(payload)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('晴天 G社 ruleContent 链', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runLegadoRuleScript 应返回含 content 的 JSON', async () => {
    const { runLegadoRuleScript } = await import('@/lib/js-engine/legado/rule-script-runner');
    const source = loadQingtianSource();
    const hex = buildGmhChapterHex();
    const code = source.ruleContent!.content!
      .replace(/^<js>/i, '')
      .replace(/<\/js>\s*\$\.content\s*$/i, '')
      .trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: hex,
        baseUrl: 'https://v1.gyks.cf/',
        ruleContent: hex,
        ruleContentType: 'text',
        source: source as unknown as Record<string, unknown>,
        book: { variable: '{"custom":"","server":"https://v1.gyks.cf/"}', durChapterIndex: 0 },
        chapter: { index: 0, title: '001话：背叛？重生！' },
        variables: {
          book_id: '32707',
          item_id: 'MzI3MDdfMTc2MDY2Mg',
          sources: 'G社漫画',
          tab: '漫画',
          title: '001话：背叛？重生！',
        },
        bookSource: source,
      },
      source,
    );

    const text = String(out ?? '');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toBe('/content');
    const parsed = JSON.parse(text) as { content?: string };
    expect(parsed.content).toBeTruthy();
    expect(parsed.content).toContain('<img');
    expect((parsed.content!.match(/<img\b/gi) ?? []).length).toBe(13);
  });

  it('完整 ruleContent 链 $.content 应产出 13 张图', async () => {
    const { analyzeString } = await import('@/lib/rule-engine');
    const { extractContentFromRuleOutput } = await import('@/lib/book-source/extract-rule-content');
    const source = loadQingtianSource();
    const hex = buildGmhChapterHex();
    const rule = source.ruleContent!.content!.trim();

    const out = await analyzeString(rule, {
      content: hex,
      contentType: 'text',
      baseUrl: 'https://v1.gyks.cf/',
      result: hex,
      source: source as unknown as Record<string, unknown>,
      book: { variable: '{"custom":"","server":"https://v1.gyks.cf/"}', durChapterIndex: 0 },
      chapter: { index: 0, title: '001话：背叛？重生！' },
      variables: {
        book_id: '32707',
        item_id: 'MzI3MDdfMTc2MDY2Mg',
        sources: 'G社漫画',
        tab: '漫画',
        title: '001话：背叛？重生！',
      },
    });

    const content = extractContentFromRuleOutput(out);
    expect(content).toContain('<img');
    expect((content.match(/<img\b/gi) ?? []).length).toBe(13);
  });
});
