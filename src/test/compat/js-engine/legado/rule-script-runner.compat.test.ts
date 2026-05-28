import { describe, expect, it, vi } from 'vitest';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import { readFixture, readProjectFile } from '@/test/helpers/fixtures';

const CHAPTER_HTML = readFixture('bacha/chapter.html');
const CHAPTER_JS = readFixture('bacha/chapter.js');

vi.mock('@/lib/http', () => ({
  get: vi.fn(async (url: string) => {
    if (String(url).includes('352056.js')) return CHAPTER_JS;
    return CHAPTER_HTML;
  }),
  post: vi.fn(async () => ''),
}));

describe('rule-script-runner', () => {
  it('八叉 content 规则可解析正文', async () => {
    const source = JSON.parse(readProjectFile('examples/shareBookSource.json')).find(
      (s: { bookSourceName?: string }) => s.bookSourceName?.includes('八叉'),
    );

    const code = source.ruleContent.content.replace(/^<js>|<\/js>$/gi, '').trim();
    const out = await runLegadoRuleScript(
      code,
      {
        result: CHAPTER_HTML,
        baseUrl: 'https://bachashuku.org/',
        ruleContent: CHAPTER_HTML,
        ruleContentType: 'html',
        source: {
          bookSourceComment: source.bookSourceComment,
          bookSourceUrl: source.bookSourceUrl,
          sourceUrl: source.bookSourceUrl,
        },
        book: { durChapterIndex: 10 },
        chapter: { index: 10, title: '第02章' },
        bookSource: source,
      },
      source,
    );

    expect(out).toBeTruthy();
    expect(String(out)).toContain('图书馆');
  });
});
