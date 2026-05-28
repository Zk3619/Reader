import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import { selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';

const TOC_HTML = `
<body>
<dl>
  <dt>第一部</dt>
  <dd><a href="/read/1.html" title="更新">第01章、测试 (12-02)</a></dd>
  <dd><a href="/read/2.html">第02章、测试二 (12-02)</a></dd>
</dl>
<div class="pagetitle"><a href="/book/6963.html">返回</a></div>
</body>`;

describe('目录列表 Legado getElements', () => {
  const baseUrl = 'https://bachashuku.org/book/6963_1.html';

  it('selectElementsOuterHtml 解析 dl dd,dt', () => {
    const items = selectElementsOuterHtml('dl dd,dt', TOC_HTML);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('analyzeListElements 每项单独 dd/dt 而非整页', async () => {
    const items = await analyzeListElements('dl dd,dt', {
      content: TOC_HTML,
      contentType: 'html',
      baseUrl,
      result: TOC_HTML,
    });
    expect(items.length).toBeGreaterThanOrEqual(3);
    const chapterItem = items.find((i) => i.content.includes('第01章'));
    expect(chapterItem).toBeDefined();
    expect(chapterItem!.content.length).toBeLessThan(TOC_HTML.length / 2);
  });

  it('章节 a@href 在单条 dd 上 isUrl 取首个', async () => {
    const dd = '<dd><a href="/read/1.html">第01章</a></dd>';
    const url = await analyzeString('a@href', {
      content: dd,
      contentType: 'html',
      baseUrl,
      result: dd,
    }, { isUrl: true });
    expect(url).toBe('/read/1.html');
    expect(url).not.toContain('\n');
  });
});
