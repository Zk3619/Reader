import { describe, expect, it } from 'vitest';
import {
  groupSubscribeSourcesByCategory,
  parseSubscribeCategoryDroppableId,
  resolveSubscribeSourceLayoutAfterReorder,
  subscribeCategoryDroppableId,
  subscribeCategoryLabel,
} from '@/lib/subscribe/subscribe-source-groups';
import type { SubSourceRow } from '@/lib/database/subscribe';

function source(partial: Partial<SubSourceRow> & { id: string }): SubSourceRow {
  return {
    url: `https://example.com/${partial.id}`,
    type: 'rss',
    title: partial.id,
    category: '',
    sortOrder: 0,
    view: 0,
    enabled: true,
    lastFetchAt: null,
    metaJson: '{}',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('subscribe-source-groups', () => {
  it('groups by category with 未分类 last', () => {
    const groups = groupSubscribeSourcesByCategory([
      source({ id: 'a', category: '科技', sortOrder: 1 }),
      source({ id: 'b', category: '', sortOrder: 0 }),
      source({ id: 'c', category: '科技', sortOrder: 0 }),
    ]);
    expect(groups.map(([c]) => c)).toEqual(['科技', '']);
    expect(groups[0]?.[1].map((s) => s.id)).toEqual(['c', 'a']);
    expect(subscribeCategoryLabel('')).toBe('未分类');
  });

  it('keeps empty known categories as placeholders', () => {
    const groups = groupSubscribeSourcesByCategory(
      [source({ id: 'a', category: '科技', sortOrder: 0 })],
      ['科技', '趋势'],
    );
    expect(groups.map(([c, list]) => [c, list.length])).toEqual([
      ['科技', 1],
      ['趋势', 0],
    ]);
  });

  it('encodes category droppable ids', () => {
    const id = subscribeCategoryDroppableId('资讯/头条');
    expect(parseSubscribeCategoryDroppableId(id)).toBe('资讯/头条');
    expect(parseSubscribeCategoryDroppableId('other')).toBeNull();
  });

  it('resolves cross-category flat reorder with new order in target category', () => {
    const sources = [
      source({ id: 'a1', category: 'A', sortOrder: 0 }),
      source({ id: 'a2', category: 'A', sortOrder: 1 }),
      source({ id: 'b1', category: 'B', sortOrder: 0 }),
      source({ id: 'b2', category: 'B', sortOrder: 1 }),
    ];
    const layout = resolveSubscribeSourceLayoutAfterReorder({
      sortedIds: ['a1', 'b1', 'a2', 'b2'],
      sources,
      activeId: 'a2',
      overId: 'b2',
    });
    expect(layout).toEqual([
      { id: 'a1', category: 'A' },
      { id: 'b1', category: 'B' },
      { id: 'a2', category: 'B' },
      { id: 'b2', category: 'B' },
    ]);
  });

  it('resolves drop on category header as append into that category', () => {
    const sources = [
      source({ id: 'a1', category: 'A', sortOrder: 0 }),
      source({ id: 'b1', category: 'B', sortOrder: 0 }),
    ];
    const layout = resolveSubscribeSourceLayoutAfterReorder({
      sortedIds: ['a1', 'b1'],
      sources,
      activeId: 'a1',
      overId: String(subscribeCategoryDroppableId('B')),
    });
    expect(layout).toEqual([
      { id: 'b1', category: 'B' },
      { id: 'a1', category: 'B' },
    ]);
  });
});
