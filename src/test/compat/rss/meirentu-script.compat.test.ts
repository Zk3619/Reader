import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRule, analyzeString } from '@/lib/rule-engine/analyze-rule';
import {
  isLegadoHtmlTemplateRule,
  splitLegadoReplaceTail,
  splitSourceRule,
} from '@/lib/rule-engine/legado-source-rule';
import { escapeInlineScriptSource } from '@/lib/rss-source/rss-inline-script';

const source = JSON.parse(
  readFileSync(join(process.cwd(), 'examples/美人图-秀人.json'), 'utf8'),
)[0] as { ruleContent: string };

const mockBody = `<html><body>
<h1>Test</h1>
<article><p>art</p></article>
<div class="item_info">info</div>
<div class="page">
<a class="current" href="https://meirentu.club/pic/328707470826.html">1</a>
<a href="https://meirentu.club/pic/328707470826-2.html">2</a>
<a href="https://meirentu.club/pic/328707470826-3.html">3</a>
</div>
</body></html>`;

const ctx = {
  content: mockBody,
  contentType: 'html' as const,
  baseUrl: 'https://meirentu.club/pic/328707470826.html',
  result: mockBody,
};

function extractGalleryScript(html: string): string {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  return scripts.map((m) => m[2] ?? '').find((s) => s.includes('pageUrls')) ?? '';
}

describe('美人图 ruleContent script', () => {
  it('识别为 HTML 模板，跳过 || 切分', () => {
    expect(isLegadoHtmlTemplateRule(source.ruleContent)).toBe(true);
    const segs = splitSourceRule(source.ruleContent);
    expect(segs.length).toBe(1);
    expect(segs[0]?.mode).toBe('default');
    const tail = splitLegadoReplaceTail(source.ruleContent);
    expect(tail.replaceRegex).toBe('');
  });

  it('analyzeRule / analyzeString 产出完整可执行正文脚本', async () => {
    const ruleResults = await analyzeRule(source.ruleContent, ctx);
    expect(ruleResults[0]?.length).toBeGreaterThan(7000);
    expect(ruleResults[0]).toContain('</html>');

    const content = await analyzeString(source.ruleContent, ctx);
    expect(content.length).toBe(ruleResults[0]?.length);
    expect(content).toContain('</html>');

    const raw = extractGalleryScript(content);
    expect(raw.length).toBeGreaterThan(5000);
    expect(() => new Function(escapeInlineScriptSource(raw))).not.toThrow();

    const pageUrlsMatch = raw.match(/const pageUrls = `([\s\S]*?)`/);
    const urls = (pageUrlsMatch?.[1] ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });
});
