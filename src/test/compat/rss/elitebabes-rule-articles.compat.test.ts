import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import { createRuleJavaAnalyzeBridge } from '@/lib/rule-engine/rule-java-analyze-bridge';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const sourceJson = JSON.parse(
  readFileSync(join(here, '../../../../examples/EliteBabes.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = sourceJson[0] as unknown as RssSource;

const listHtml = `<!DOCTYPE html><html><body>
<ul class="list-gallery">
  <li><figure><a href="/gallery/one/" title="One">One</a></figure></li>
  <li><figure><a href="/gallery/two/" title="Two">Two</a></figure></li>
  <li><figure><video></video></li>
</ul>
</body></html>`;

/** 对齐站点：每个 figure 内多个 a，规则 a.0 应取各 figure 的第一个链接 */
const multiAnchorHtml = `<!DOCTYPE html><html><body>
<ul class="list-gallery">
  <li><figure>
    <a href="https://www.elitebabes.com/gallery-one/" title="One"><img src="/1.jpg"></a>
    <div class="img-overlay"><p><a href="https://www.elitebabes.com/gallery-one/">One</a></p></div>
  </figure></li>
  <li><figure>
    <a href="https://www.elitebabes.com/gallery-two/" title="Two"><img src="/2.jpg"></a>
    <div class="img-overlay"><p><a href="https://www.elitebabes.com/gallery-two/">Two</a></p></div>
  </figure></li>
</ul>
</body></html>`;

describe('EliteBabes ruleArticles', () => {
  it('rule-java-analyze-bridge getElements 返回多个 a', () => {
    const bridge = createRuleJavaAnalyzeBridge({ baseUrl: 'https://www.elitebabes.com' });
    bridge.setContent('<a href="/gallery/one/">1</a><a href="/gallery/two/">2</a>');
    const links = bridge.getElements('a');
    expect(links.length).toBe(2);
  });

  it('java.setContent + java.getElements 产出多条文章（跳过 video）', async () => {
    const ctx: RuleContext = {
      content: listHtml,
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/sort/trending/',
      source: source as unknown as Record<string, unknown>,
    };
    const items = await analyzeListElements(String(source.ruleArticles), ctx);
    expect(items.length).toBe(2);
    expect(items.every((i) => i.content.includes('/gallery/'))).toBe(true);
  });

  it('真实 trending 页 HTML 应解析出多条文章', async () => {
    const fixture = join(here, '../../../../tmp-elitebabes-trending.html');
    if (!existsSync(fixture)) return;
    const ctx: RuleContext = {
      content: readFileSync(fixture, 'utf8'),
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/sort/trending/',
      source: source as unknown as Record<string, unknown>,
    };
    const items = await analyzeListElements(String(source.ruleArticles), ctx);
    expect(items.length).toBeGreaterThanOrEqual(15);
  });

  it('li@figure@a.0 在每个 figure 上取第一个 a', async () => {
    const ctx: RuleContext = {
      content: multiAnchorHtml,
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/sort/trending/',
      source: source as unknown as Record<string, unknown>,
    };
    const items = await analyzeListElements(String(source.ruleArticles), ctx);
    expect(items.length).toBe(2);
    expect(items[0]?.content).toContain('gallery-one');
    expect(items[1]?.content).toContain('gallery-two');
  });
});
