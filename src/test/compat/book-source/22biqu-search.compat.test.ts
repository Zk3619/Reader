import { describe, expect, it } from 'vitest';
import { parseCss } from '@/lib/rule-engine/css-parser';
import { analyzeListElements } from '@/lib/rule-engine/analyze-rule';

const SEARCH_LIST_HTML = `<div class="container">
<ul class="txt-list txt-list-row5">
<li><span class="s1"><b>作品分类</b></span> <span class="s2"><b>作品名称</b></span> <span class="s3"><b>最新章节</b></span> <span class="s4"><b>作者</b></span></li>
<li>
<span class="s1">[玄幻魔法]</span>
<span class="s2"><a href="/biqu111813/">我的学习群里全是真大佬</a></span>
<span class="s3"><a href="/biqu111813/51408161.html">第98章</a></span>
<span class="s4">佚名</span>
</li>
</ul>
</div>`;

describe('22biqu search bookList', () => {
  const rule = 'class.txt-list txt-list-row5@li!0';

  it('skips header row via li!0', () => {
    const items = parseCss(rule, SEARCH_LIST_HTML);
    expect(items.length).toBe(1);
    expect(items[0]).toContain('我的学习群里全是真大佬');
    expect(items[0]).not.toContain('作品名称');
  });

  it('analyzeListElements returns book rows only', async () => {
    const items = await analyzeListElements(rule, {
      content: SEARCH_LIST_HTML,
      contentType: 'html',
      baseUrl: 'https://www.22biqu.com/ss/',
    });
    expect(items.length).toBe(1);
    expect(items[0]?.content).toContain('我的学习群里全是真大佬');
  });
});
