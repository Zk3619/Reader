import { describe, expect, it } from 'vitest';
import { kazumiPluginToBangumiRule, importKazumiRulesJson } from '@/lib/media/video/bangumi/kazumi-adapter';
import { BANGUMI_RULE_API_LEVEL } from '@/lib/media/video/bangumi/prefs';

describe('kazumi-adapter', () => {
  it('maps DM84-like fields', () => {
    const { rule, skippedReason } = kazumiPluginToBangumiRule({
      api: '5',
      name: 'DM84',
      baseURL: 'https://dmbus.cc/',
      searchURL: 'https://dmbus.cc/s----------.html?wd=@keyword',
      searchList: '//div/ul/li',
      searchName: '//div/a[2]',
      searchResult: '//div/a[2]',
      chapterRoads: '//div/ul',
      chapterResult: '//li/a',
      useWebview: true,
    });
    expect(skippedReason).toBeUndefined();
    expect(rule?.name).toBe('DM84');
    expect(rule?.baseUrl).toBe('https://dmbus.cc/');
    expect(rule?.searchPath).toContain('{keyword}');
    expect(rule?.searchLink).toBe('//div/a[2]');
    expect(rule?.chapterList).toBe('//div/ul');
    expect(rule?.chapterLink).toBe('//li/a');
    expect(rule?.useWebview).toBe(true);
  });

  it('skips apiLevel above client', () => {
    const { rule, skippedReason } = kazumiPluginToBangumiRule({
      api: String(BANGUMI_RULE_API_LEVEL + 1),
      name: 'TooNew',
      baseURL: 'https://example.com/',
    });
    expect(rule).toBeNull();
    expect(skippedReason).toMatch(/apiLevel/);
  });

  it('imports plugin array JSON', () => {
    const text = JSON.stringify([
      {
        api: '5',
        name: 'A',
        baseURL: 'https://a.example/',
        searchURL: '/s?q=@keyword',
        searchList: '.item',
        searchResult: 'a@href',
      },
    ]);
    const r = importKazumiRulesJson(text);
    expect(r.imported).toBe(1);
    expect(r.rules[0]?.searchPath).toContain('{keyword}');
  });
});
