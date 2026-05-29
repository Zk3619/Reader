/**
 * Legado 规则语法回归（Vitest）
 */
import { describe, expect, it } from 'vitest';
import { parseCss } from '@/lib/rule-engine/css-parser';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
import { getRegexElements, parseRegex } from '@/lib/rule-engine/regex-parser';
import { splitRuleByOperators, zipMergeRuleResults } from '@/lib/rule-engine/rule-analyzer';
import { compileSourceRule } from '@/lib/rule-engine/source-rule';
import { analyzeRule, parseRule } from '@/lib/rule-engine/analyze-rule';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';
import { LEGADO_COMPAT_BASELINE } from '@/lib/rule-engine/legado-compat-baseline';
import { evalJs } from '@/lib/js-engine';
import { parseAnalyzeUrlOption, splitUrlAndOption } from '@/lib/book-source/analyze-url-option';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';

const html = `
<ul>
  <li class="b"><a class="novelname" href="/1">书名A</a><span class="author">作者甲</span></li>
  <li class="b"><a class="novelname" href="/2">书名B</a><span class="author">作者乙</span></li>
</ul>`;

describe('rule-analyzer', () => {
  it('splits && outside brackets', () => {
    const { parts, op } = splitRuleByOperators('a&&b');
    expect(op).toBe('&&');
    expect(parts).toEqual(['a', 'b']);
  });

  it('zip merges %%', () => {
    expect(zipMergeRuleResults([['1', '2'], ['A', 'B']])).toEqual(['1', 'A', '2', 'B']);
  });

  it('does not split replacement tail inside {{}}', () => {
    const parsed = parseRule("{{//p[@class='gray']/text()[1]##\\s##,}}##\\|.*##");
    expect(parsed.ruleBody).toContain("{{//p[@class='gray']/text()[1]##\\s##,}}");
    expect(parsed.replacement?.pattern).toBe('\\|.*');
  });
});

describe('css-parser', () => {
  it('parses chain with @text', () => {
    const r = parseCss('li.b@a.novelname@text', html);
    expect(r).toEqual(['书名A', '书名B']);
  });

  it('returns per-element @all outer html', () => {
    const r = parseCss('li.b@all', html);
    expect(r.length).toBe(2);
    expect(r[0]).toContain('novelname');
    expect(r[0]).toContain('书名A');
  });

  it('supports tag index', () => {
    const r = parseCss('li.b.0@text', html);
    expect(r[0]).toContain('书名A');
  });

  it('supports legado td.N index on table row', () => {
    const tr =
      '<tr><td>玄幻</td><td><a class="db" href="/book/1">谋臣</a></td><td>388483</td><td>连载</td></tr>';
    expect(parseCss('td.2@text', tr)).toEqual(['388483']);
    expect(parseCss('td.-2@text', tr)[0]?.trim()).toBe('388483');
    expect(parseCss('td.1@a@text', tr)[0]?.trim()).toContain('谋臣');
  });

  it('normalizes @text whitespace like legado jsoup', async () => {
    const sample = `
      <div class="c_row cf">
        <p class="gray">散人 | #后宫 #母子
        <br>    半夜无聊窝在房间里上网，随手滑到一个莫名其妙的网站。</p>
      </div>
    `;
    const out = await analyzeRule('tag.p@text##(\\|.*)$', {
      content: sample,
      contentType: 'html',
    });
    expect(out).toEqual(['散人']);
  });
});

describe('jsonpath-parser', () => {
  const json = JSON.stringify({ data: [{ title: 'A' }, { title: 'B' }] });

  it('flattens array result', () => {
    const r = parseJsonPath('$.data', json);
    expect(r.length).toBe(2);
    expect(r[0]).toContain('title');
  });

  it('supports || fallback', () => {
    const r = parseJsonPath('$.missing||$.data', json);
    expect(r.length).toBe(2);
  });

  it('supports %% zip merge like legado', () => {
    const payload = JSON.stringify({
      left: [{ n: 'L1' }, { n: 'L2' }],
      right: [{ n: 'R1' }],
    });
    const r = parseJsonPath('$.left[*].n%%$.right[*].n', payload);
    expect(r).toEqual(['L1', 'R1', 'L2']);
  });

  it('expands {$...} inner path before query', () => {
    const json = JSON.stringify({ data: { title: '嵌套标题' } });
    const r = parseJsonPath('前缀{$.data.title}后缀', json);
    expect(r[0]).toBe('前缀嵌套标题后缀');
  });

  it('strips @all extractor suffix before JSONPath query', () => {
    const payload = JSON.stringify({
      data: [{ book_name: '甲', author: '作者A' }, { book_name: '乙', author: '作者B' }],
    });
    const r = parseJsonPath('$.data@all', payload);
    expect(r.length).toBe(2);
    expect(r[0]).toContain('book_name');
    expect(r[0]).toContain('甲');
  });
});

describe('analyzeRule JSON explore (晴天聚合)', () => {
  const listJson = JSON.stringify({
    data: [
      { book_name: '测试书名', author: '测试作者', book_id: 'id-1' },
      { book_name: '第二本', author: '作者二', book_id: 'id-2' },
    ],
  });

  it('bookList $.data@all yields per-book JSON elements', async () => {
    const items = await analyzeRule('$.data@all', {
      content: listJson,
      contentType: 'json',
    });
    expect(items.length).toBe(2);
    const first = JSON.parse(items[0]!);
    expect(first.book_name).toBe('测试书名');
  });

  it('field rules $.book_name / $.author on list item', async () => {
    const row = JSON.stringify({ book_name: '测试书名', author: '测试作者' });
    const name = await analyzeRule('$.book_name', {
      content: row,
      contentType: 'json',
    });
    const author = await analyzeRule('$.author', {
      content: row,
      contentType: 'json',
    });
    expect(name[0]).toBe('测试书名');
    expect(author[0]).toBe('测试作者');
  });

  it('analyzeListElements $.data@all does not treat rule as list item (explore bookList)', async () => {
    const { analyzeListElements, analyzeString: analyzeStringFn } = await import(
      '@/lib/rule-engine'
    );
    const listJson = JSON.stringify({
      data: [
        { book_name: '测试书名', author: '测试作者', book_id: 'id-1' },
        { book_name: '第二本', author: '作者二', book_id: 'id-2' },
      ],
    });
    const items = await analyzeListElements('$.data@all', {
      content: listJson,
      contentType: 'json',
    });
    expect(items.length).toBe(2);
    expect(items[0]!.content).not.toBe('$.data@all');
    const first = JSON.parse(items[0]!.content);
    expect(first.book_name).toBe('测试书名');
    const name = await analyzeStringFn('$.book_name', {
      content: items[0]!.content,
      contentType: 'json',
    });
    expect(name).toBe('测试书名');
  });
});

describe('xpath-parser', () => {
  it('handles text()[n] by non-empty direct text nodes', async () => {
    const out = await analyzeRule('//p[@class="gray"]/text()[2]', {
      content: '<p class="gray">作者：甲 | #后宫 #母子</p>',
      contentType: 'html',
    });
    expect(out[0]).toBe('#后宫 #母子');
  });

  it('ignores whitespace text nodes when indexing text()[n]', async () => {
    const out = await analyzeRule('//p[@class="gray"]/text()[2]', {
      content: '<p class="gray">\n  散人 | #后宫 #母子\n  半夜无聊\n</p>',
      contentType: 'html',
    });
    expect(out[0]).toBe('半夜无聊');
  });
});

describe('regex-parser', () => {
  const text = '<item id="1">A</item><item id="2">B</item>';

  it('extracts list via :regex stages', () => {
    const groups = getRegexElements(
      '<item id="(\\d+)">([^<]+)</item>',
      text,
    );
    expect(groups.length).toBe(2);
    expect(groups[0][1]).toBe('1');
    expect(groups[0][2]).toBe('A');
  });

  it('chains && stages (Legado AnalyzeByRegex)', () => {
    const r = parseRegex('(<item[^>]*>.*?</item>)&&>([^<]+)<', text);
    expect(r).toEqual(['A', 'B']);
  });

  it('supports || at regex top level', () => {
    const r = parseRegex('missing-(\\d+)-||<item id="(\\d+)">([^<]+)</item>', text);
    expect(r).toEqual(['1', '2']);
  });

  it('returns capture groups for :regex list', () => {
    const groups = getRegexElements('<item id="(\\d+)">([^<]+)</item>', text);
    expect(groups.length).toBe(2);
    expect(groups[1][1]).toBe('2');
    expect(groups[1][2]).toBe('B');
  });
});

describe('source-rule', () => {
  it('expands $1 from regexGroups', async () => {
    const ctx: RuleContext = {
      content: html,
      regexGroups: ['', '书名A', '作者甲'],
      variables: { k: '变量值' },
    };
    const out = await compileSourceRule('$1-$2', ctx, {
      expandTemplate: async () => '',
      expandJs: async () => '',
    });
    expect(out).toBe('书名A-作者甲');
  });

  it('expands @get', async () => {
    const ctx: RuleContext = {
      content: html,
      variables: { key: 'OK' },
    };
    const out = await compileSourceRule('@get:{key}', ctx, {
      expandTemplate: async () => '',
      expandJs: async () => '',
    });
    expect(out).toBe('OK');
  });

  it('keeps missing $N token', async () => {
    const ctx: RuleContext = {
      content: html,
      regexGroups: ['', 'A'],
    };
    const out = await compileSourceRule('$1-$2', ctx, {
      expandTemplate: async () => '',
      expandJs: async () => '',
    });
    expect(out).toBe('A-$2');
  });
});

describe('mixed segments', () => {
  it('applies top-level replacement after mixed execution', async () => {
    const out = await analyzeRule('<js>["A","B"]</js>##A##Z', {
      content: '<div>noop</div>',
      contentType: 'html',
    });
    expect(out).toEqual(['Z', 'B']);
  });

  it('keeps default chain after @js: segment boundary', async () => {
    const out = await analyzeRule('@js:["x","y"] && :([xy])', {
      content: 'x\ny',
      contentType: 'text',
    });
    expect(out.length).toBeGreaterThan(0);
  });

  it('keeps default chain after @js: boundary without spaces', async () => {
    const out = await analyzeRule('@js:["x","y"]&&:([xy])', {
      content: 'x\ny',
      contentType: 'text',
    });
    expect(out.length).toBeGreaterThan(0);
  });

  it('supports html string result in <js> context', async () => {
    const out = await analyzeRule('<js>typeof result === "string" ? "ok" : "bad"</js>', {
      content: '<div class="c_row">row</div>',
      contentType: 'html',
    });
    expect(out).toEqual(['ok']);
  });

  it('supports list + <js> chain for search bookList style', async () => {
    const sourceHtml = `
      <div id="jieqi_page_contents">
        <div class="c_row"><a class="novelname" href="/1">书名A</a></div>
        <div class="c_row"><a class="novelname" href="/2">书名B</a></div>
      </div>
    `;
    const rule = `#jieqi_page_contents@.c_row
<js>
if (result.length===0){ result; }
result
</js>`;
    const { analyzeListElements } = await import('@/lib/rule-engine');
    const out = await analyzeListElements(rule, {
      content: sourceHtml,
      contentType: 'html',
      baseUrl: 'https://bachashuku.org/modules/article/search.php',
    });
    expect(out.length).toBe(2);
    expect(out[0].content).toContain('novelname');
  });

  it('routes {{//...}} template to xpath instead of css', async () => {
    const out = await analyzeRule("{{//p[@class='gray']/text()[1]}}", {
      content: '<div><p class="gray">作者甲 著</p></div>',
      contentType: 'html',
      baseUrl: 'https://example.com',
    });
    expect(out).toEqual(['作者甲 著']);
  });

  it('supports ### replace-first semantics', async () => {
    const out = await analyzeRule(':A##A##Z###', {
      content: 'A A A',
      contentType: 'text',
    });
    expect(out[0]).toContain('Z');
  });

  it('keeps replacement tail containing ## intact', async () => {
    const out = await analyzeRule('foo##foo##A##B', {
      content: 'foo',
      contentType: 'text',
    });
    expect(out).toEqual(['A##B']);
  });

  it('expands <js> inside replacement pattern before replace', async () => {
    const out = await analyzeRule('fooTail##foo<js>"Tail"</js>##X', {
      content: 'fooTail',
      contentType: 'text',
    });
    expect(out).toEqual(['X']);
  });

  it('applies {{}} before splitting ## in mixed chain', async () => {
    const out = await analyzeRule('<js>"A"</js>##{{@js:"A"}}##Z', {
      content: 'noop',
      contentType: 'text',
    });
    expect(out).toEqual(['Z']);
  });

  it('treats template-leading rule as literal before replace (Legado parity)', async () => {
    const out = await analyzeRule(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      {
        content:
          '<div class="c_row"><p class="gray">何处惹尘埃 | #NTR #绿帽</p></div>',
        contentType: 'html',
      },
    );
    // 关键断言：模板展开后不应再走 CSS 解析；| 前元数据应被 ##.*\|## 去掉
    expect(out[0]).not.toContain('何处惹尘埃');
    expect(out[0]).toContain('NTR');
  });

  it('supports legacy kind cleanup chain with js marker in replaceRegex', async () => {
    const out = await analyzeRule(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      {
        content:
          '<div class="c_row"><p class="gray">何处惹尘埃 | #NTR #绿帽</p></div>',
        contentType: 'html',
      },
    );
    expect(out[0]).toBe('#,#NTR,#绿帽');
  });

  it('truncates intro tail from gray text()[1] for bacha kind', async () => {
    const row = `
      <div class="c_row cf">
        <div class="row_text">
          <h4>我的炉鼎美母</h4>
          <p class="gray"># #后宫 #母子 #制服 #AI生成<br />半夜无聊窝在房间里上网，随手滑到一个莫名其妙的网站。</p>
        </div>
      </div>`;
    const out = await analyzeRule(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      { content: row, contentType: 'html' },
    );
    expect(out[0]).not.toContain('半夜');
    expect(out[0]).toContain('后宫');
  });

  it('supports @get in replacement stage', async () => {
    const out = await analyzeRule('foo##foo##@get:{k}', {
      content: 'foo',
      contentType: 'text',
      variables: { k: 'BAR' },
    });
    expect(out).toEqual(['BAR']);
  });
});

describe('compat baseline', () => {
  it('freezes stage0 baseline cases', () => {
    expect(LEGADO_COMPAT_BASELINE.length).toBeGreaterThanOrEqual(4);
    const ids = LEGADO_COMPAT_BASELINE.map((c) => c.id);
    expect(ids).toContain('search-js-url-template');
    expect(ids).toContain('toc-next-page');
    expect(ids).toContain('content-next-page-replace');
  });
});

describe('rule expression consistency', () => {
  it('recognizes legacy rule operators as rule expressions', () => {
    expect(isRuleExpression('$.data&&@js:result')).toBe(true);
    expect(isRuleExpression('//div[@id="x"]')).toBe(true);
    expect(isRuleExpression('result + 1')).toBe(false);
  });
});

describe('js fallback java polyfill', () => {
  it('keeps java helpers callable in script sandbox', async () => {
    const out = await evalJs(
      `
      java.put("k", "v");
      java.get("k");
      `,
      {
        result: {},
        baseUrl: 'https://example.com',
      },
    );
    expect(typeof out === 'string' || out === null).toBe(true);
  });
});

describe('url option compatibility', () => {
  it('splits url and option object', () => {
    const out = splitUrlAndOption('https://a.com/s, {"method":"POST"}');
    expect(out.urlPart).toBe('https://a.com/s');
    expect(out.optionsJson).toBe('{"method":"POST"}');
  });

  it('parses permissive option object', () => {
    const opt = parseAnalyzeUrlOption("{method:'POST',webView:true,webJs:'return 1;',retry:'2'}");
    expect(opt.method).toBe('POST');
    expect(opt.useWebView).toBe(true);
    expect(opt.webJs).toContain('return 1');
    expect(opt.retry).toBe(2);
  });
});
