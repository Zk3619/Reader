import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import { evalJs } from '@/lib/js-engine';
import { javaGetString } from '@/lib/rule-engine/java-get-string';
import { normalizeUrlRuleResult, resolveUrl } from '@/lib/book-source/utils';
import { getBookInfo } from '@/lib/book-source/detail';
import type { BookSource } from '@/types';

/** 八叉详情页结构简化（与 shareBookSource ruleBookInfo 字段对应） */
const BACHA_DETAIL_HTML = `
<div class="row_textl">
  <h4>《老婆的性感开发之旅》</h4>
</div>
<p class="gray fss">
<span class="fr fss"><a href="#">成为本书编辑</a></span><a href="#">8083979（我不是大神）</a> 著<br />
<span class="iconfont">&#xee21;</span>25851 | <span class="iconfont">&#xee5d;</span>28 | <span class="iconfont">&#xee81;</span>299 | 1425230字<br />
<b class="fl">标签：</b><a href="#">#NTR</a>
</p>
<div class="nw cf">
  <div class="nw.0">
    <span class="ratenum">4.8</span>
    <span class="gray">99人已评</span>
  </div>
  <p class="nw.1">最新：第二部 第五十八草</p>
</div>
<p class="gray">8083979（我不是大神） | 12345 | 678 | 910</p>
<a class="more" href="/book/6963_1.html">章节列表</a>
<a href="https://bachashuku.org/">首页</a>
<div class="blockcontent fss"><div id="introa">这是简介正文，包含若干文字。</div></div>
<ul class="ullist">
  <li class="db cf">读者甲：好看 18:30:00</li>
  <li class="db cf">读者乙：追更 19:00:00</li>
</ul>
`;

const baseUrl = 'https://bachashuku.org/book/6963.html';
const redirectUrl = baseUrl;

describe('Legado 详情语义', () => {
  const context = {
    content: BACHA_DETAIL_HTML,
    contentType: 'html' as const,
    baseUrl,
    result: BACHA_DETAIL_HTML,
    variables: {} as Record<string, unknown>,
  };

  it('tocUrl 规则 isUrl 时仅取首个 href（对齐 getString0）', async () => {
    const toc = await analyzeString('.more@href||text.全部章节@href', context, { isUrl: true });
    expect(toc).toBe('/book/6963_1.html');
    expect(toc).not.toContain('bachashuku.org');
    const abs = resolveUrl(redirectUrl, toc);
    expect(abs).toBe('https://bachashuku.org/book/6963_1.html');
  });

  it('resolveUrl 防御多行/粘连', () => {
    expect(normalizeUrlRuleResult('/book/6963_1.html\nhttps://bachashuku.org')).toBe(
      '/book/6963_1.html',
    );
    expect(
      resolveUrl(redirectUrl, '/book/6963_1.htmlhttps:/bachashuku.org'),
    ).toBe('https://bachashuku.org/book/6963_1.html');
  });

  it('java.getString 可解析详情子规则', () => {
    const title = javaGetString('h4@text', { content: BACHA_DETAIL_HTML, baseUrl });
    expect(title).toContain('老婆的性感开发之旅');
    const intro = javaGetString('#introa@text', { content: BACHA_DETAIL_HTML, baseUrl });
    expect(intro).toContain('简介正文');
  });

  it('java.getString 解析八叉 intro 与评论规则', () => {
    const tag10 = javaGetString(
      '//div[@class="blockcontent fss"]//div[@id="introa"]/text()',
      { content: BACHA_DETAIL_HTML, baseUrl },
    );
    expect(tag10).toContain('简介正文');

    const tag11 = javaGetString('.ullist@tag.li@class.db cf@text', {
      content: BACHA_DETAIL_HTML,
      baseUrl,
    });
    expect(tag11).toMatch(/读者甲|读者乙/);
    expect(tag11).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('完整 intro js 含简介与评论段', async () => {
    const wordCountRule = `@js:
var a='12.34万';
var c='12.34万字';
result=c;
java.put("num",c)`;
    await analyzeString(wordCountRule, context);

    const introRule = `<js>
var tag10=String(java.getString('//div[@class="blockcontent fss"]//div[@id="introa"]/text()')).replace(/\\s{2,}/g,'');
var tag11=String(java.getString('.ullist@tag.li@class.db cf@text')).replace(/\\d{2}:\\d{2}:\\d{2}/g,'🏮');
tag10 + '\\n---\\n' + tag11
</js>`;
    const out = String(await analyzeString(introRule, context));
    expect(out).toContain('简介正文');
    expect(out).toMatch(/读者甲|读者乙/);
  });

  it('wordCount @js put 后 intro @get 可展开', async () => {
    const wordCountRule = `@js:
var a=java.getString('//p[@class="gray fss"]/text()[6]');
var b=String(a).replace(/.*\\|/,'').replace(/字/,'');
var number = parseInt(b);
var c = number >= 10000 ? (number / 10000).toFixed(2) + '万字' : number + '字';
result=c;
java.put("num",c)`;

    await analyzeString(wordCountRule, context);
    expect(context.variables.num).toBe('142.52万字');

    const introJs = `<js>
var tag1=String(java.getString('h4@text')).replace(/.*《|》/g,'');
var tag4='@get:{num}';
tag1 + '|' + tag4
</js>`;
    const out = String(await analyzeString(introJs, context)).trim();
    expect(out).toContain('老婆的性感开发之旅');
    expect(out).not.toContain('@get:{num}');
    expect(out).toContain('142.52万字');
  });

  it('intro js 允许隐式赋值 tag7/tag8/tag9（非 strict）', async () => {
    const introFragment = `<js>
var rtag7='12345';
var number = parseInt(rtag7);
if (number >= 10000) {
	tag7 = (number / 10000).toFixed(2) + '万';
} else {
	tag7 = number;
}
tag7
</js>`;
    const html = '<p class="gray">test</p>';
    const ctx = {
      content: html,
      contentType: 'html' as const,
      baseUrl,
      result: html,
      variables: {} as Record<string, unknown>,
    };
    const out = await analyzeString(introFragment, ctx);
    expect(String(out)).toMatch(/12345|1\.23万/);
  });

  it('evalJs 内 java.getString 读取详情 DOM', async () => {
    const code = `String(java.getString('h4@text')).replace(/.*《|》/g,'')`;
    const title = await evalJs(code, {
      result: BACHA_DETAIL_HTML,
      baseUrl,
      ruleContent: BACHA_DETAIL_HTML,
      ruleContentType: 'html',
    });
    expect(String(title)).toContain('老婆的性感开发之旅');
  });

  it('ruleBookInfo.tocUrl 为 javascript:history.go 时应回退 bookUrl', async () => {
    const html = `
      <div class="cataloginfo"><h1>测试书</h1></div>
      <div>章节目录<a href="javascript:history.go(-1);">目录</a></div>
    `;
    const source = {
      sourceName: '测试源',
      sourceUrl: 'https://example.com',
      bookSourceUrl: 'https://example.com',
      enabledCookieJar: true,
      sourceType: 0,
      ruleBookInfo: {
        name: '.cataloginfo@h1@text',
        tocUrl: 'text.章节目录@a@href',
      },
    } as unknown as BookSource;
    const bookUrl = 'https://example.com/book/1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    try {
      const info = await getBookInfo(source, bookUrl);
      expect(info).toBeTruthy();
      expect(info?.tocUrl).toBe(bookUrl);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
