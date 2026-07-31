import { describe, expect, it } from 'vitest';
import { presentForShow } from '@/components/shared/virtual-list/VirtualList';

describe('presentForShow', () => {
  it('keeps numeric zero so grid row index 0 is not dropped', () => {
    expect(presentForShow(0)).toEqual({ value: 0 });
    expect(presentForShow('')).toEqual({ value: '' });
    expect(presentForShow(false)).toEqual({ value: false });
  });

  it('rejects null and undefined', () => {
    expect(presentForShow(null)).toBe(false);
    expect(presentForShow(undefined)).toBe(false);
  });
});
