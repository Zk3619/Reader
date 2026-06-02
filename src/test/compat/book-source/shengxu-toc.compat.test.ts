import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import { buildRelaxedTocXPathListRule } from '@/lib/book-source/chapters';

/** 信息卡在 container 内，最新/完整目录为 section 直接子级（对齐真实详情页） */
const SHENGXU_TOC_HTML = `
<section>
  <div class="container">
    <div class="card mt20"><p>书籍信息</p></div>
  </div>
  <div class="card mt20">
    <h2>圣墟 最新章节列表</h2>
    <ul class="dirlist clearfix">
      <li><a href="/book_1/999.html">最新章</a></li>
      <li><a href="/book_1/998.html">上一章</a></li>
    </ul>
  </div>
  <div class="card mt20">
    <h2>圣墟 章节目录</h2>
    <ul class="dirlist clearfix">
      <li><a href="/book_1/1.html">第一章 开端</a></li>
      <li><a href="/book_1/2.html">第二章 发展</a></li>
      <li><a href="/book_1/3.html">第三章 结局</a></li>
    </ul>
  </div>
</section>`;

describe('圣墟小说网 dirlist 双区块', () => {
  const baseUrl = 'http://www.shengxuxu.net/book_1/';
  const ctx = {
    content: SHENGXU_TOC_HTML,
    contentType: 'html' as const,
    baseUrl,
    result: SHENGXU_TOC_HTML,
  };

  const legadoRule =
    '//div[@class="card mt20"][2]//ul[@class="dirlist clearfix"]/li@all';

  it('Legado [2] 规则在双区块页命中完整章节目录', async () => {
    const items = await analyzeListElements(legadoRule, ctx);
    const blob = items.map((i) => i.content).join('\n');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(blob).toContain('第一章');
    expect(blob).not.toContain('最新章');
  });

  it('页面前有 container 包裹信息卡时 [2] 仍命中完整目录', async () => {
    const htmlWithExtraCard = `
<section>
  <div class="container">
    <div class="card mt20"><p>书籍信息</p></div>
  </div>
  <div class="card mt20">
    <ul class="dirlist clearfix"><li><a href="/999.html">最新章</a></li></ul>
  </div>
  <div class="card mt20">
    <ul class="dirlist clearfix">
      <li><a href="/1.html">第一章</a></li>
      <li><a href="/2.html">第二章</a></li>
      <li><a href="/3.html">第三章</a></li>
    </ul>
  </div>
</section>`;
    const items = await analyzeListElements(legadoRule, {
      ...ctx,
      content: htmlWithExtraCard,
      result: htmlWithExtraCard,
    });
    expect(items.length).toBe(3);
    expect(items.map((i) => i.content).join('\n')).toContain('第一章');
  });

  it('宽松回退规则去掉 [n] 时会合并两区', async () => {
    const relaxed = buildRelaxedTocXPathListRule(legadoRule);
    expect(relaxed).toBeTruthy();
    const items = await analyzeListElements(relaxed!, ctx);
    expect(items.length).toBeGreaterThan(3);
  });
});
