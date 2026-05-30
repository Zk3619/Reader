import { describe, expect, it } from 'vitest';
import { parseCss, selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';

const sampleHtml = `
<ul class="comic-list">
  <li class="comic-list-item"><span class="comic-name"><a href="/a">书A</a></span></li>
  <li class="comic-list-item"><span class="comic-name"><a href="/b">书B</a></span></li>
</ul>
<ul class="catalog-list">
  <li class="chapter-item"><a href="/c1">第1话</a></li>
  <li class="chapter-item"><a href="/c2">第2话</a></li>
</ul>
`;

describe('@css: 规则解析', () => {
  it('legadoListRuleNeedsAllSuffix 对 @css: 规则仍应补 @all', () => {
    expect(legadoListRuleNeedsAllSuffix('@css:.comic-list-item')).toBe(true);
    expect(legadoListRuleNeedsAllSuffix('@css:.item@all')).toBe(false);
    expect(legadoListRuleNeedsAllSuffix('.plain@text')).toBe(false);
  });

  it('selectElementsOuterHtml 支持 @css: 列表选择器', () => {
    const items = selectElementsOuterHtml('@css:.comic-list-item@all', sampleHtml);
    expect(items.length).toBe(2);
    expect(items[0]).toContain('comic-list-item');
  });

  it('parseCss 支持 @css: 目录项', () => {
    const items = parseCss('@css:.catalog-list li.chapter-item@all', sampleHtml);
    expect(items.length).toBe(2);
    expect(items[0]).toContain('chapter-item');
  });

  it('parseCss 支持 @css: 带 @text 提取', () => {
    const names = parseCss('@css:.comic-name a@text', sampleHtml);
    expect(names).toContain('书A');
    expect(names).toContain('书B');
  });
});
