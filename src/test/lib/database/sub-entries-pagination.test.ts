import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(async () => []),
}));

vi.mock('@/lib/database/database-core', () => ({
  getDatabase: vi.fn(async () => ({
    select: mocks.select,
    execute: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  })),
}));

import { listSubEntries } from '@/lib/database/sub-entries';

describe('sub-entries pagination', () => {
  beforeEach(() => {
    mocks.select.mockClear();
  });

  it('sorts like Folo and applies a stable tuple cursor', async () => {
    await listSubEntries({
      feedIds: ['feed-a', 'feed-b'],
      before: { sortTime: 1000, createdAt: 900, id: 'entry-z' },
      limit: 21,
    });

    const call = mocks.select.mock.calls[0] as unknown as [string, unknown[]];
    const [sql, params] = call;
    expect(sql).toContain('COALESCE(published_at, created_at) DESC');
    expect(sql).toContain('created_at DESC, id DESC');
    expect(sql).toContain('COALESCE(published_at, created_at) < ?');
    expect(params).toEqual([
      'feed-a',
      'feed-b',
      1000,
      1000,
      900,
      1000,
      900,
      'entry-z',
      21,
    ]);
  });
});
