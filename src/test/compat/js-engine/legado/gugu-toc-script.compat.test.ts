import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeListElements } from '@/lib/rule-engine';
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import { getChapterList } from '@/lib/book-source/chapters';
import sourceList from '../../../../../examples/1780106748.json';
import type { BookSource } from '@/types';

const GUGU_DETAIL_HTML = `<!DOCTYPE html><html><body>
<ul class="anthology-list-play size">
  <li><a href="/play/1.html">第01集</a></li>
  <li><a href="/play/2.html">第02集</a></li>
</ul>
<ul class="anthology-list-play size">
  <li><a href="/play/3.html">第01集</a></li>
</ul>
</body></html>`;

const GUGU_TOC_JS = `@js:
const html = org.jsoup.Jsoup.parse(java.ajax(baseUrl));
let items = html.select("ul.anthology-list-play.size");
let plist = [];

for (let n = 0; n < items.size(); n++) {
    let item = items.get(n).select("li > a");
    for (let i = 0; i < item.size(); i++) {
        let a = item.get(i);
        let title = a.text();
        let href = a.attr("href");
        let source  = "播放路线  " + (n + 1);
        plist.push({
            title: title,
            url: href,
            source: source
        });
    }
}

plist;`.replace(/^@js:\n/, '');

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/book-source/fetch-source-page', () => ({
  fetchSourcePage: vi.fn(),
}));

vi.mock('@/lib/book-source/login-check', () => ({
  assertLoginCheckPassed: vi.fn(async () => {}),
}));

import { get } from '@/lib/http';
import { fetchSourcePage } from '@/lib/book-source/fetch-source-page';

describe('咕咕番目录 rule-script', () => {
  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(fetchSourcePage).mockReset();
    vi.mocked(fetchSourcePage).mockResolvedValue({
      body: GUGU_DETAIL_HTML,
      url: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      usedWebView: false,
    });
    vi.mocked(get).mockResolvedValue(GUGU_DETAIL_HTML);
  });

  it('chapterList 脚本可执行并返回章节数组', async () => {
    vi.mocked(get).mockResolvedValue(GUGU_DETAIL_HTML);

    const out = await runLegadoRuleScript(
      GUGU_TOC_JS,
      {
        result: GUGU_DETAIL_HTML,
        baseUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
        ruleContent: GUGU_DETAIL_HTML,
        ruleContentType: 'html',
        source: { bookSourceUrl: 'https://www.gugu3.com/' },
        book: { name: '测试' },
      },
      {
        bookSourceName: '咕咕番',
        bookSourceUrl: 'https://www.gugu3.com/',
        sourceUrl: 'https://www.gugu3.com/',
      } as never,
    );

    expect(Array.isArray(out)).toBe(true);
    expect((out as unknown[]).length).toBeGreaterThan(0);
    const first = (out as { title?: string; url?: string }[])[0];
    expect(first?.title?.trim()).toBeTruthy();
    expect(first?.url?.trim()).toBeTruthy();
  });

  it('@js chapterList 不应被误补 @all', () => {
    const rule = (sourceList as unknown as BookSource[])[0].ruleToc?.chapterList ?? '';
    expect(legadoListRuleNeedsAllSuffix(rule)).toBe(false);
  });

  it('analyzeListElements 与 chapters 路径一致可解析目录', async () => {
    vi.mocked(get).mockResolvedValue(GUGU_DETAIL_HTML);
    const source = (sourceList as unknown as BookSource[])[0];
    let chapterListRule = source.ruleToc?.chapterList ?? '';
    if (legadoListRuleNeedsAllSuffix(chapterListRule)) {
      chapterListRule = `${chapterListRule}@all`;
    }

    const items = await analyzeListElements(chapterListRule, {
      content: GUGU_DETAIL_HTML,
      contentType: 'html',
      baseUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      source: source as unknown as Record<string, unknown>,
    });

    expect(items.length).toBeGreaterThan(0);
  });

  it('真实详情 HTML 可解析多线路章节', async () => {
    const html = readFileSync(join(process.cwd(), 'tmp-gugu-detail.html'), 'utf8');
    vi.mocked(get).mockResolvedValue(html);
    const source = (sourceList as unknown as BookSource[])[0];
    const chapterListRule = source.ruleToc?.chapterList ?? '';

    const items = await analyzeListElements(chapterListRule, {
      content: html,
      contentType: 'html',
      baseUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      source: source as unknown as Record<string, unknown>,
    });

    expect(items.length).toBeGreaterThan(0);
  });

  it('getChapterList 可解析 JSON 目录项 title/url', async () => {
    const source = (sourceList as unknown as BookSource[])[0];
    const chapters = await getChapterList(
      source,
      'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
    );
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0]?.title).toContain('第');
    expect(chapters[0]?.url).toMatch(/\/play\//);
  });
});
