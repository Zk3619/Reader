import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import { splitLegadoReplaceTail, splitSourceRule } from '@/lib/rule-engine/legado-source-rule';
import { analyzeRule } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const sourceJson = JSON.parse(
  readFileSync(join(here, '../../../../examples/绅士会所.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = sourceJson[0] as unknown as RssSource;

const miniArticleHtml = `<div class="content">
  <img data-original="https://cdn.sshs.rip/a1/a2/img1.webp">
  <img data-original="https://cdn.sshs.rip/a3/a4/img2.webp">
  <img data-original="https://cdn.sshs.rip/a5/a6/img3.webp">
</div>
<div class="song-info"><h3>测试标题</h3></div>
<div id="myList"><h4>2024-01-01</h4></div>`;

describe('绅士会所 ruleContent', () => {
  it('splitSourceRule 拆为 CSS + JS + HTML 模板三段', () => {
    const segs = splitSourceRule(String(source.ruleContent));
    expect(segs.map((s) => s.mode)).toEqual(['default', 'js', 'default']);
    expect(segs.length).toBe(3);
    expect(segs[0]?.ruleStr).toContain('data-original');
    expect(segs[1]?.mode).toBe('js');
    expect(segs[2]?.ruleStr).toContain('{{result}}');
  });

  it('CSS 段 ##\\n##$ 将多图 URL 合并为 $ 分隔', async () => {
    const segs = splitSourceRule(String(source.ruleContent));
    const tail = splitLegadoReplaceTail(segs[0]!.ruleStr);
    expect(tail.replaceRegex).toBe('\\n');
    const ctx: RuleContext = {
      content: miniArticleHtml,
      contentType: 'html',
      baseUrl: 'https://www.hentaiclub.net/article/1/',
    };
    const urls = await analyzeRule(segs[0]!.ruleStr, ctx);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('$');
    expect(urls[0]?.split('$').length).toBeGreaterThanOrEqual(3);
  });

  it('应生成带 img 的画廊 HTML，而非裸 URL 文本', async () => {
    const ctx: RuleContext = {
      content: miniArticleHtml,
      contentType: 'html',
      baseUrl: 'https://www.hentaiclub.net/article/1/',
      source: source as unknown as Record<string, unknown>,
    };
    const html = await analyzeString(String(source.ruleContent), ctx);
    expect(html).toContain('<ul id="box">');
    expect(html).toContain('<img');
    expect(html).toContain('data-src="https://cdn.sshs.rip/');
    expect(html).not.toMatch(/<ul id="box">\s*https:\/\//);
    const imgCount = (html.match(/<img\b/gi) ?? []).length;
    expect(imgCount).toBeGreaterThanOrEqual(3);
  });
});
