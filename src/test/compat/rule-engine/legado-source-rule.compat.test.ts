import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';
import {
  hasEmbeddedLegadoScript,
  isAtomicLegadoScriptRule,
  splitSourceRule,
  unwrapLegadoJsSnippet,
} from '@/lib/rule-engine/legado-source-rule';
import { wrapLegadoJsBodyWithImplicitReturn } from '@/lib/js-engine/quickjs-sandbox';
import { splitRuleByOperators } from '@/lib/rule-engine/rule-analyzer';

describe('unwrapLegadoJsSnippet / isAtomicLegadoScriptRule', () => {
  it('unwraps full <js> block', () => {
    const raw = '<js>\nlet x = 1;\n</js>';
    expect(unwrapLegadoJsSnippet(raw)).toBe('let x = 1;');
  });

  it('treats <js> script with internal || as atomic (no operator split)', () => {
    const rule = `<js>
let tab = result.tab || '小说';
'ok'
</js>`;
    expect(isAtomicLegadoScriptRule(rule)).toBe(true);
    const { parts, op } = splitRuleByOperators(rule);
    expect(op).toBe('||');
    expect(parts.length).toBeGreaterThan(1);
  });

  it('hasEmbeddedLegadoScript for css + @js chain', () => {
    const rule =
      ".db@href\n@js:\nvar href = result;\nvar id = href.match(/book\\/(\\d+)/)?.[1] || '0';\nid;";
    expect(hasEmbeddedLegadoScript(rule)).toBe(true);
    expect(isAtomicLegadoScriptRule(rule)).toBe(false);
  });

  it('wrapLegadoJsBodyWithImplicitReturn strips trailing semicolon on last expression', () => {
    const wrapped = wrapLegadoJsBodyWithImplicitReturn(
      "var x = 1;\n'https://example.com/' + x + '.jpg';",
    );
    expect(wrapped).toContain("return ('https://example.com/' + x + '.jpg')");
    expect(wrapped).not.toMatch(/return \(.*;\);/);
  });

  it('analyzeString resolves css@href + @js cover (|| inside js)', async () => {
    const tr =
      '<tr><td><a class="db nw" href="https://bachashuku.org/book/25650.html">谋臣</a></td></tr>';
    const coverRule =
      ".db@href\n@js:\nvar href = result;\nvar bookId = href.match(/book\\/(\\d+)/)?.[1] || '0';\nvar prefix = bookId.length <= 3 ? '0' : bookId.slice(0, bookId.length - 3);\n'https://image.8xsk.org/' + prefix + '/' + bookId + '/' + bookId + 's.jpg';";
    const out = await analyzeString(coverRule, {
      content: tr,
      contentType: 'html',
      baseUrl: 'https://bachashuku.org/',
      result: tr,
    });
    expect(out).toBe('https://image.8xsk.org/25/25650/25650s.jpg');
  });

  it('analyzeString does not use || fallback inside <js> bookUrl script', async () => {
    const bookUrlRule = `<js>
let book_id = result.book_id;
let tab = result.tab || '小说';
\`data:;base64,\${book_id}\`
</js>`;
    const row = { book_id: 'bid-1', source: '番茄', tab: '小说' };
    const element = JSON.stringify(row);
    const out = await analyzeString(bookUrlRule, {
      content: element,
      contentType: 'json',
      baseUrl: 'https://example.com',
      result: row,
      book: row,
    });
    expect(out).not.toBe('小说');
    expect(out.startsWith('data:;base64,')).toBe(true);
    expect(out).toContain('bid-1');
  });
});

describe('splitSourceRule JSON @all extractor', () => {
  it('keeps $.data@all as one segment (does not split @all after stripReplacementTail)', () => {
    const segments = splitSourceRule('$.data@all');
    expect(segments).toHaveLength(1);
    expect(segments[0]?.ruleStr).toBe('$.data@all');
    expect(segments[0]?.mode).toBe('default');
  });
});

describe('splitSourceRule inline <js>result</js>', () => {
  it('does not split replacement placeholder as independent js segment', () => {
    const rule =
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#";
    const segments = splitSourceRule(rule);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.mode).toBe('default');
    expect(segments[0]?.ruleStr).toContain('<js>result</js>');
    expect(segments[0]?.ruleStr).not.toMatch(/^result$/m);
  });

  it('splits <js>…</js>$.content into js then json path (Legado ruleContent)', () => {
    const rule = `<js>
let data = JSON.stringify({ code: 0, content: 'hello' });
data;
</js>$.content`;
    const segments = splitSourceRule(rule);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.mode).toBe('js');
    expect(segments[1]?.mode).toBe('default');
    expect(segments[1]?.ruleStr).toBe('$.content');
  });
});

describe('analyzeString <js>…</js>$.content chain', () => {
  it('extracts manga contents via api helper after js segment', async () => {
    const rule = `<js>
JSON.stringify({ code: 0, contents: ['https://cdn.example/a.jpg'] });
</js>$.content`;
    const hexBody = '7b22626f6f6b5f6964223a22626964227d';
    const out = await analyzeString(rule, {
      content: hexBody,
      contentType: 'text',
      baseUrl: 'https://v1.gyks.cf',
      result: hexBody,
    });
    expect(out).toContain('<img src="https://cdn.example/a.jpg">');
  });
});
