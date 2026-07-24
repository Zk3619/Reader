import { describe, expect, it } from 'vitest';
import {
  buildBangumiSearchParams,
  filterBangumiSearchByMatchMode,
  parseBangumiSearchQuery,
  seasonToDateRange,
} from '@/lib/media/video/bangumi/meta/search-filter';
import { DEFAULT_BANGUMI_SEARCH_FILTER } from '@/lib/media/video/bangumi/meta/search-filter';

describe('bangumi search-filter', () => {
  it('builds Kazumi-like search body defaults', () => {
    const body = buildBangumiSearchParams('孤独摇滚', DEFAULT_BANGUMI_SEARCH_FILTER);
    expect(body.keyword).toBe('孤独摇滚');
    expect(body.sort).toBe('heat');
    expect(body.filter).toMatchObject({
      type: [2],
      nsfw: false,
      rank: ['>=0', '<=99999'],
    });
  });

  it('uses rank >0 when sort is rank without custom range', () => {
    const body = buildBangumiSearchParams('', {
      ...DEFAULT_BANGUMI_SEARCH_FILTER,
      sort: 'rank',
      tags: ['百合'],
    });
    expect(body.filter.rank).toEqual(['>0', '<=99999']);
    expect(body.filter.tag).toEqual(['百合']);
  });

  it('maps JP season window like Kazumi', () => {
    expect(seasonToDateRange('2024Q1')).toEqual({
      start: '2023-12-01',
      end: '2024-03-01',
    });
  });

  it('parses query tokens', () => {
    const r = parseBangumiSearchQuery('摇滚 tag:音乐 sort:score weekday:1,5');
    expect(r.keyword).toBe('摇滚');
    expect(r.patch.tags).toEqual(['音乐']);
    expect(r.patch.sort).toBe('score');
    expect(r.patch.weekdays).toEqual([1, 5]);
  });

  it('filters by match mode', () => {
    const list = [
      { name: 'Bocchi', nameCn: '孤独摇滚！' },
      { name: 'Other', nameCn: '别的' },
    ];
    expect(filterBangumiSearchByMatchMode(list, '孤独', 'exact')).toHaveLength(1);
    expect(filterBangumiSearchByMatchMode(list, '孤摇', 'fuzzy')).toHaveLength(1);
    expect(filterBangumiSearchByMatchMode(list, '孤独', 'normal')).toHaveLength(2);
  });
});
