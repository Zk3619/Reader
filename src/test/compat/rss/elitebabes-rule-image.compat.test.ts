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

describe('EliteBabes ruleImage', () => {
  it('列表项无 img 时不应泄漏 a 标签 HTML', async () => {
    const ctx: RuleContext = {
      content: '<a href="/gallery/one/" title="One">One</a>',
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/sort/trending/',
      source: source as unknown as Record<string, unknown>,
    };
    const image = await analyzeString(String(source.ruleImage), ctx);
    expect(image).toBe('');
  });

  it('列表项含 img srcset 时解析封面 URL', async () => {
    const ctx: RuleContext = {
      content:
        '<a href="/gallery/one/" title="One"><img srcset="https://cdn.example/cover.jpg 800w, https://cdn.example/cover-sm.jpg 400w"></a>',
      contentType: 'html',
      baseUrl: 'https://www.elitebabes.com/sort/trending/',
      source: source as unknown as Record<string, unknown>,
    };
    const image = await analyzeString(String(source.ruleImage), ctx);
    expect(image).toBe('https://cdn.example/cover.jpg ');
  });
});
