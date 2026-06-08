import { describe, expect, it } from 'vitest';

import { sqlNonNegativeInt } from '@/lib/chapter-cache/sql-stats';

describe('sqlNonNegativeInt', () => {
  it('coerces sqlite string aggregates', () => {
    expect(sqlNonNegativeInt('42')).toBe(42);
    expect(sqlNonNegativeInt('1024')).toBe(1024);
  });

  it('returns 0 for nullish and invalid', () => {
    expect(sqlNonNegativeInt(null)).toBe(0);
    expect(sqlNonNegativeInt(undefined)).toBe(0);
    expect(sqlNonNegativeInt('')).toBe(0);
    expect(sqlNonNegativeInt(Number.NaN)).toBe(0);
  });
});
