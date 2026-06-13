import { describe, expect, it } from 'vitest';
import { parseUpdateTimeToMs } from '@/lib/format/display-time';

describe('parseUpdateTimeToMs', () => {
  it('parses unix seconds and milliseconds', () => {
    expect(parseUpdateTimeToMs('1704067200')).toBe(1704067200000);
    expect(parseUpdateTimeToMs('1704067200000')).toBe(1704067200000);
  });

  it('parses formatted date strings', () => {
    const ms = parseUpdateTimeToMs('2024-01-01 08:00');
    expect(ms).not.toBeNull();
    expect(new Date(ms!).getFullYear()).toBe(2024);
  });

  it('returns null for placeholders', () => {
    expect(parseUpdateTimeToMs('--')).toBeNull();
    expect(parseUpdateTimeToMs('未知')).toBeNull();
  });
});
