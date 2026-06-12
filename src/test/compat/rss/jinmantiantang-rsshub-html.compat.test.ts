import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import { parseCss, selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';

/** 对齐 RSSHub ProcessItems 当前 DOM（.video-title + .thumb-overlay） */
const RSSHUB_HTML = `
<html><body><div class="container"><div class="row">
<div class="col-6 col-md-3">
  <div class="thumb-overlay">
    <a href="/album/1128075/"><img title="[作者A] 测试标题一" src="https://cdn.example/1.jpg"></a>
  </div>
  <div class="video-title">测试标题一</div>
</div>
<div class="col-6 col-md-3">
  <div class="thumb-overlay">
    <a href="/album/646291/"><img title="[作者B] 测试标题二" src="https://cdn.example/2.jpg"></a>
  </div>
  <div class="video-title">测试标题二</div>
</div>
</div></div></body></html>
`;

const RULE = 'class.list-col||@css:a[href*="/album/"]@all';

describe('禁漫 RSSHub DOM', () => {
  it('parseCss 组合规则在 RSSHub DOM 上', () => {
    const items = parseCss(RULE, RSSHUB_HTML);
    console.log('parseCss', items.length, items[0]?.slice(0, 100));
    expect(items.length).toBeGreaterThan(0);
  });

  it('thumb-overlay 列表', async () => {
    const ruleArticles = '@css:.thumb-overlay@all';
    const items = await analyzeListElements(ruleArticles, {
      content: RSSHUB_HTML,
      contentType: 'html',
      baseUrl: 'https://18comic.vip/albums?o=mr',
    });
    expect(items.length).toBe(2);
    const ctx: RuleContext = {
      content: items[0]!.content,
      contentType: 'html',
      baseUrl: 'https://18comic.vip',
    };
    const title = await analyzeString('tag.img@title##\\[.*?\\]|【.*?】', ctx);
    const link = await analyzeString(
      'tag.a@href@js:result.replace(/.*?album\\/(\\d+).*/g,"/photo/$1")',
      ctx,
    );
    expect(title).toBe('测试标题一');
    expect(link).toContain('/photo/1128075');
  });

  it('a[href*="/album/"] 在 RSSHub DOM', () => {
    const items = selectElementsOuterHtml('@css:a[href*="/album/"]@all', RSSHUB_HTML);
    expect(items.length).toBe(2);
  });
});
