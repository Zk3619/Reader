import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { analyzeListElements } from '@/lib/rule-engine/analyze-rule';
import { evalJs } from '@/lib/js-engine/quickjs-sandbox';
import { patchLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-patches';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/软件分享-难受云.json'), 'utf8'),
)[0] as RssSource;

const lanzoueUrl = 'https://mby.lanzoue.com/b016iz5kgd';

describe('软件分享-难受云 lanzoue.com', () => {
  it('patchLegadoRuleScript 重命名 function $ 辅助函数', () => {
    const patched = patchLegadoRuleScript(
      'function $(reg) { return uri.match(reg) ? true : false }\n$(/##/)',
    );
    expect(patched).toContain('function __readerUriMatch(reg)');
    expect(patched).toContain('__readerUriMatch(/##/)');
    expect(patched).not.toMatch(/function \$\(/);
  });

  it('ruleArticles 使用 rssAsBookSource 与 App 一致解析列表', async () => {
    const book = rssAsBookSource(source);
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: lanzoueUrl,
      source: book,
      baseUrl: source.sourceUrl,
    });
    expect(body.length).toBeGreaterThan(8000);
    expect(body).toContain('var pgs');

    const rule = String(source.ruleArticles);
    const jsSeg = rule.match(/<js>([\s\S]*?)<\/js>/)?.[1] ?? '';

    const listItems = await analyzeListElements(rule, {
      content: body,
      contentType: 'html',
      baseUrl: lanzoueUrl,
      source: book as unknown as Record<string, unknown>,
    });

    const jsOut = await evalJs(jsSeg, {
      result: body,
      baseUrl: lanzoueUrl,
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: body,
      ruleContentType: 'html',
    });

    expect(String(jsOut ?? '').length).toBeGreaterThan(2);
    if (typeof jsOut === 'string' && jsOut.trim().startsWith('[')) {
      const parsed = JSON.parse(jsOut) as unknown[];
      expect(parsed.length).toBeGreaterThan(5);
      expect(listItems.length).toBeGreaterThan(5);
    } else {
      expect.fail(`ruleArticles 应返回 JSON 数组，实际: ${String(jsOut).slice(0, 120)}`);
    }
  }, 60_000);
});
