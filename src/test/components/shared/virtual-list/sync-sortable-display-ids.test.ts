import { describe, expect, it } from 'vitest';
import { syncSortableDisplayIds } from '@/components/shared/virtual-list/virtual-list-sortable-display-order';

describe('syncSortableDisplayIds', () => {
  it('persistOnly keeps display order when members match but external order lags', () => {
    const display = ['b', 'a', 'c'];
    const staleExternal = ['a', 'b', 'c'];
    expect(syncSortableDisplayIds(display, staleExternal, true)).toEqual(['b', 'a', 'c']);
  });

  it('persistOnly merges when members are added or removed', () => {
    expect(syncSortableDisplayIds(['b', 'a'], ['a', 'c', 'b'], true)).toEqual(['b', 'a', 'c']);
    expect(syncSortableDisplayIds(['a', 'b', 'c'], ['c', 'a'], true)).toEqual(['a', 'c']);
  });

  it('non-persistOnly always follows external', () => {
    expect(syncSortableDisplayIds(['b', 'a'], ['a', 'b'], false)).toEqual(['a', 'b']);
  });
});
