import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine';
import type { RuleContext } from '@/lib/rule-engine';

const here = dirname(fileURLToPath(import.meta.url));
const sourceJson = JSON.parse(
  readFileSync(join(here, '../../../../examples/1比1娃娃美图秀.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = sourceJson[0]!;

const shopListItem = `<div class="brxe-ivopbr product">
  <div class="product-title"><a href="/p/1">测试商品 A</a></div>
  <a class="brxe-sfypzq" href="/product/test-a/"><img data-src="https://cdn.example/a.jpg" /></a>
</div>`;

const shopPageHtml = `<!DOCTYPE html><html><body>
  ${shopListItem}
  <div class="brxe-ivopbr product">
    <div class="product-title"><a href="/p/2">测试商品 B</a></div>
    <a class="brxe-sfypzq" href="/product/test-b/"><img src="https://cdn.example/b.jpg" /></a>
  </div>
</body></html>`;

function baseContext(content: string): RuleContext {
  return {
    content,
    contentType: 'html',
    baseUrl: 'https://hksexdoll.com/shop/',
    source,
  };
}

describe('1:1 娃娃美图秀 RSS 规则', () => {
  it('ruleArticles @js 产出列表项 HTML', async () => {
    const items = await analyzeListElements(String(source.ruleArticles), baseContext(shopPageHtml));
    expect(items.length).toBe(2);
    expect(items[0]?.content).toContain('product-title');
    expect(items[0]?.content).toContain('brxe-ivopbr');
  });

  it('ruleTitle / ruleLink / ruleImage 解析列表项字段', async () => {
    const ctx = baseContext(shopListItem);
    const title = await analyzeString(String(source.ruleTitle), ctx);
    const link = await analyzeString(String(source.ruleLink), ctx);
    const image = await analyzeString(String(source.ruleImage), ctx);
    expect(title).toBe('测试商品 A');
    expect(link).toBe('/product/test-a/');
    expect(image).toBe('https://cdn.example/a.jpg');
  });
});
