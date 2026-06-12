import { describe, expect, it } from 'vitest';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';
import { detectSourceRuleMode } from '@/lib/rule-engine/legado-source-rule';
import { readProjectFile } from '@/test/helpers/fixtures';
import type { RssSource } from '@/types';

const source = JSON.parse(readProjectFile('examples/Strip 直播.json'))[0] as RssSource;

const modelItem = JSON.stringify({
  id: 240965874,
  username: 'meiguigongzhu520',
  popularSnapshotTimestamp: 1781263202,
});

describe('Strip直播 RSS 规则', () => {
  it('ruleLink /{$.username} 不走 XPath', () => {
    expect(detectSourceRuleMode('/{$.username}')).toBe('default');
  });

  it('ruleLink 展开内嵌 JSONPath', async () => {
    const link = await analyzeString(String(source.ruleLink), {
      content: modelItem,
      contentType: 'json',
      baseUrl: source.sourceUrl,
    });
    expect(link).toBe('/meiguigongzhu520');
  });

  it('ruleTitle 解析 username', async () => {
    const title = await analyzeString(String(source.ruleTitle), {
      content: modelItem,
      contentType: 'json',
      baseUrl: source.sourceUrl,
    });
    expect(title).toBe('meiguigongzhu520');
  });
});
