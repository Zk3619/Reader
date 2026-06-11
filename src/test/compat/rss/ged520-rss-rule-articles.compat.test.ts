import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scriptReferencesJsLibFunctions } from '@/lib/js-engine/legado/js-lib-script-guard';
import { evalJs } from '@/lib/js-engine/quickjs-sandbox';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/1781199162.json'), 'utf8'),
)[0] as RssSource;

describe('辞晨 ruleArticles jsLib', () => {
  it('识别 TD/setzt/getUrl 依赖 jsLib', () => {
    expect(scriptReferencesJsLibFunctions('TD()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('setzt()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('getUrl()')).toBe(true);
    expect(scriptReferencesJsLibFunctions('eval(String(source.loginUrl))')).toBe(true);
    expect(scriptReferencesJsLibFunctions('java.setContent(html)')).toBe(false);
  });

  it('evalJs 加载 jsLib 执行 getUrl()', async () => {
    const book = rssAsBookSource(source);
    const out = await evalJs('getUrl()', {
      result: '',
      baseUrl: 'http://ged520.yeoi.me/',
      source: book as unknown as Record<string, unknown>,
      bookSource: book,
      ruleContent: '<html></html>',
      ruleContentType: 'html',
    });
    expect(String(out ?? '').trim()).toBe('ged520');
  }, 30_000);
});
