import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import type { RuleContext } from '@/lib/rule-engine';

describe('RSS ruleTitle @js with result.select', () => {
  it('parses title from list item HTML via Jsoup-like result', async () => {
    const listItem = `<div class="product">
      <div class="product-title"><a href="/p/1">测试商品</a></div>
    </div>`;
    const context: RuleContext = {
      content: listItem,
      contentType: 'html',
      baseUrl: 'https://hksexdoll.com/shop/',
    };
    const rule = `@js:
if (baseUrl.includes("hksexdoll.com")) {
    result = result.select(".product-title a").text();
} else {
    result = result.text();
}
result;`;
    const title = await analyzeString(rule, context);
    expect(title).toBe('测试商品');
  });
});
