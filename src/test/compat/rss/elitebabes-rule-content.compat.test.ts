import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const sourceJson = JSON.parse(
  readFileSync(join(here, '../../../../examples/EliteBabes.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = sourceJson[0] as unknown as RssSource;

/** 测试夹具：模拟书源内联 jsLib，非引擎内置 */
const miniJsLib = `
function danyeHtml(imgSrc) {
  const list = String(imgSrc).split('\\n').map((s) => s.trim()).filter(Boolean);
  return '<ul>' + list.map((u) => '<li><img data-src="' + u + '"></li>').join('') + '</ul>';
}
`.trim();

describe('EliteBabes ruleContent', () => {
  it('内联 jsLib + danyeHtml 生成正文 HTML', async () => {
    const ctx: RuleContext = {
      content: `<ul class="list-gallery">
        <li><a data-srcset="https://cdn.example/1.jpg 800w, https://cdn.example/1-sm.jpg 400w"></a></li>
        <li><a data-srcset="https://cdn.example/2.jpg 1200w"></a></li>
      </ul>`,
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/metart-rose-sarinz-in-ruby-lips/',
      source: { ...source, jsLib: miniJsLib } as unknown as Record<string, unknown>,
    };
    const html = await analyzeString(String(source.ruleContent), ctx);
    expect(html).toContain('data-src="https://cdn.example/1.jpg"');
    expect(html).toContain('data-src="https://cdn.example/2.jpg"');
  });
});
