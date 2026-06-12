import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';

const LIST_ITEM_HTML = `
<li class="col-md-6 col-sm-4 col-xs-3">
  <div class="stui-vodlist__box">
    <a class="stui-vodlist__thumb lazyload" href="/index.php/vod/detail/id/67838.html" title="测试标题" data-original="/upload/vod/x.jpg">
      <span class="play hidden-xs"></span>
      <span class="pic-text text-right">第1集</span>
    </a>
    <div class="stui-vodlist__detail">
      <h4 class="title text-overflow"><a href="/index.php/vod/detail/id/67838.html" title="测试标题">测试标题</a></h4>
    </div>
  </div>
</li>`;

const PAGE_HTML = `<ul class="stui-vodlist clearfix">${LIST_ITEM_HTML}</ul>`;

const baseUrl = 'https://www.yinghua228.com/index.php/vod/type/id/20.html';

const RULE_ARTICLES = '.col-md-6||ul.col-pd@li';

async function parseFirstArticle(html: string) {
  const listItems = await analyzeListElements(RULE_ARTICLES, {
    content: html,
    contentType: 'html',
    baseUrl,
  });
  const ctx: RuleContext = {
    content: listItems[0]!.content,
    contentType: 'html',
    baseUrl,
  };
  return {
    count: listItems.length,
    title: await analyzeString('a@text', ctx),
    link: await analyzeString('a@href', ctx),
    image: await analyzeString('a@data-original', ctx),
  };
}

describe('樱花动漫 ruleArticles', () => {
  it('.col-md-6||ul.col-pd@li 列表项为 HTML 且 a@text 可解析标题', async () => {
    const out = await parseFirstArticle(PAGE_HTML);
    expect(out.count).toBe(1);
    expect(out.title).toContain('测试标题');
    expect(out.link).toContain('/vod/detail/');
    expect(out.image).toContain('/upload/vod/');
  });

  it('|| 第一分支无匹配时回退 ul.col-pd@li', async () => {
    const textListHtml = `
      <ul class="stui-vodlist__text col-pd clearfix">
        <li><a href="/index.php/vod/detail/id/1.html" title="备用标题">备用标题</a></li>
      </ul>`;
    const out = await parseFirstArticle(textListHtml);
    expect(out.count).toBe(1);
    expect(out.title).toBe('备用标题');
  });
});
