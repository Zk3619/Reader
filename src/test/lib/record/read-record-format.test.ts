import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  formatReadDuration,
  formatRelativeLastRead,
} from '@/lib/record/read-record-format';

describe('read-record-format', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats short durations', () => {
    expect(formatReadDuration(0)).toBe('0 秒');
    expect(formatReadDuration(45)).toBe('45 秒');
    expect(formatReadDuration(120)).toBe('2 分钟');
    expect(formatReadDuration(3720)).toBe('1 小时 2 分钟');
    expect(formatReadDuration(90000)).toBe('1 天 1 小时');
  });

  it('formats relative last read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T15:30:00'));

    expect(formatRelativeLastRead(Date.now() - 30_000)).toBe('刚刚');
    expect(formatRelativeLastRead(Date.now() - 5 * 60_000)).toBe('5 分钟前');
    expect(formatRelativeLastRead(new Date('2026-06-09T10:20:00').getTime())).toBe(
      '今天 10:20',
    );
    expect(formatRelativeLastRead(new Date('2026-06-08T21:00:00').getTime())).toBe(
      '昨天 21:00',
    );
    expect(formatRelativeLastRead(new Date('2026-06-05T12:00:00').getTime())).toBe('4 天前');
  });
});
