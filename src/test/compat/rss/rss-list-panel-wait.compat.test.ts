import { describe, expect, it } from 'vitest';
import { resolveRssListPanelWait } from '@/lib/rss-source/fetch-rss-page';
import type { RssSource } from '@/types';

describe('resolveRssListPanelWait', () => {
  it('从 ruleArticles 提取等待选择器', () => {
    const source = {
      ruleArticles:
        'class.list-col||@css:.thumb-overlay@all||@css:a[href*="/album/"]@all',
    } as RssSource;
    const wait = resolveRssListPanelWait(source);
    expect(wait?.selector).toBe(
      '.list-col, .thumb-overlay, a[href*="/album/"]',
    );
    expect(wait?.minCount).toBe(4);
  });

  it('无 ruleArticles 时不等待', () => {
    expect(resolveRssListPanelWait({} as RssSource)).toBeUndefined();
  });

  it('无法解析时回退 a[href]', () => {
    const wait = resolveRssListPanelWait({
      ruleArticles: ':invalid-regex-only',
    } as RssSource);
    expect(wait?.selector).toBe('a[href]');
    expect(wait?.minCount).toBe(6);
  });
});
