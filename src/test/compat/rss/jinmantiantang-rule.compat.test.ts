import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import { selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';

/** 对齐 JMComic-Crawler-Python 分类页 HTML 片段（无 list-col） */
const CATEGORY_HTML = `
<html><body>
<div class="container">
  <div class="row">
    <a href="/album/1128075/"><img title="[作者A] 测试标题一" data-original="https://cdn.example/albums/1128075_3x4.jpg" src="blank.jpg"></a>
    <div class="label-loveicon"><a>标签</a></div>
    <div class="clearfix"></div>
    <a href="/album/646291/"><img title="[作者B] 测试标题二" src="https://cdn.example/albums/646291_3x4.jpg"></a>
    <div class="label-loveicon"><a>3D</a></div>
    <div class="clearfix"></div>
  </div>
  <ul class="pagination"><li class="prevnext"><a href="/albums?o=mr&page=2">下一页</a></li></ul>
</div>
</body></html>
`;

const LEGACY_HTML = `
<html><body>
<div class="list-col"><a href="/album/123/"><img title="旧版标题" src="x.jpg"></a></div>
</body></html>
`;

async function parseOneArticle(
  ruleArticles: string,
  ruleTitle: string,
  ruleLink: string,
  html: string,
) {
  const baseUrl = 'https://18comic.vip/albums?o=mr';
  const listItems = await analyzeListElements(ruleArticles, {
    content: html,
    contentType: 'html',
    baseUrl,
  });
  if (listItems.length === 0) return null;
  const ctx: RuleContext = {
    content: listItems[0]!.content,
    contentType: 'html',
    baseUrl,
  };
  const title = await analyzeString(ruleTitle, ctx);
  const link = await analyzeString(ruleLink, ctx);
  return { count: listItems.length, title, link };
}

describe('禁漫天堂 ruleArticles', () => {
  it('selectElementsOuterHtml 支持 class.list-col', () => {
    const items = selectElementsOuterHtml('class.list-col', LEGACY_HTML);
    expect(items.length).toBe(1);
    expect(items[0]).toContain('list-col');
  });

  it('旧版 class.list-col 在 legacy HTML 上可解析', async () => {
    const out = await parseOneArticle(
      'class.list-col',
      'tag.img@title##\\[.*?\\]|【.*?】',
      'tag.a.0@href@js:result.replace(/.*?album\\/(\\d+).*/g,"/photo/$1")',
      LEGACY_HTML,
    );
    expect(out?.count).toBe(1);
    expect(out?.title).toBe('旧版标题');
  });

  it('新版 a[href*="/album/"] 在分类页 HTML 上可解析', async () => {
    const out = await parseOneArticle(
      '@css:a[href*="/album/"]@all',
      'tag.img@title##\\[.*?\\]|【.*?】',
      '@href@js:result.replace(/.*?album\\/(\\d+).*/g,"/photo/$1")',
      CATEGORY_HTML,
    );
    expect(out?.count).toBe(2);
    expect(out?.title).toBe('测试标题一');
    expect(out?.link).toContain('/photo/1128075');
  });

  it('class.list-col 在新版 HTML 上无结果', async () => {
    const items = await analyzeListElements('class.list-col', {
      content: CATEGORY_HTML,
      contentType: 'html',
      baseUrl: 'https://18comic.vip',
    });
    expect(items.length).toBe(0);
  });

  it('兼容规则同时覆盖 legacy 与新版 HTML', async () => {
    const ruleArticles =
      'class.list-col||@css:.thumb-overlay@all||@css:a[href*="/album/"]@all';
    const ruleLink =
      'tag.a@href||tag.a.0@href||@href@js:result.replace(/.*?album\\/(\\d+).*/g,"/photo/$1")';
    const ruleTitle =
      'tag.img@title||tag.img@alt||.video-title@text##\\[.*?\\]|【.*?】';
    const legacy = await parseOneArticle(ruleArticles, ruleTitle, ruleLink, LEGACY_HTML);
    const modern = await parseOneArticle(ruleArticles, ruleTitle, ruleLink, CATEGORY_HTML);
    expect(legacy?.count).toBe(1);
    expect(modern?.count).toBe(2);
  });

  it('img 仅有 alt 时 ruleTitle 回退可解析', async () => {
    const html = `
<html><body>
<a href="/album/999001/"><img alt="[作者X] 仅 alt 标题" src="x.jpg"></a>
</body></html>`;
    const out = await parseOneArticle(
      '@css:a[href*="/album/"]@all',
      'tag.img@title||tag.img@alt##\\[.*?\\]|【.*?】',
      '@href@js:result.replace(/.*?album\\/(\\d+).*/g,"/photo/$1")',
      html,
    );
    expect(out?.count).toBe(1);
    expect(out?.title).toBe('仅 alt 标题');
  });

  it('|| 分支中的 :regex 可匹配 a[href] 块', async () => {
    const ruleArticles =
      '@css:.missing@all||:<a[^>]*href="[^"]*?/album/\\d+[^"]*"[^>]*>[\\s\\S]*?</a>';
    const items = await analyzeListElements(ruleArticles, {
      content: CATEGORY_HTML,
      contentType: 'html',
      baseUrl: 'https://18comic.vip',
    });
    expect(items.length).toBe(2);
  });
});
