import { describe, expect, it } from 'vitest';

import { recordKey } from '@/lib/record/reading-history';

describe('reading-history', () => {
  it('builds stable record keys for name and author', () => {
    expect(recordKey('书名', '作者')).toBe('书名\0作者');
    expect(recordKey('书名', '')).toBe('书名\0');
    expect(recordKey('A', 'B')).not.toBe(recordKey('A', 'C'));
  });
});
