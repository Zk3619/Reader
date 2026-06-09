import { describe, expect, it } from 'vitest';
import {
  aggregateDailyReadStats,
  buildFallbackDailyStats,
  buildHeatmapCells,
  buildMonthCalendarDays,
  fillHeatmapCells,
  filterReadRecordEntriesByDate,
  getCalendarCellValue,
} from '@/lib/record/read-record-daily';
import type { ReadRecordDetail } from '@/types';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';

describe('read-record-daily', () => {
  it('aggregates counts and times by date', () => {
    const details: ReadRecordDetail[] = [
      {
        deviceId: 'd1',
        bookName: 'A',
        bookAuthor: '',
        date: '2026-06-01',
        readTime: 120,
        readWords: 0,
        firstReadTime: 1,
        lastReadTime: 2,
      },
      {
        deviceId: 'd1',
        bookName: 'B',
        bookAuthor: '',
        date: '2026-06-01',
        readTime: 180,
        readWords: 0,
        firstReadTime: 1,
        lastReadTime: 2,
      },
    ];

    const stats = aggregateDailyReadStats(details);
    expect(stats.dailyReadCounts.get('2026-06-01')).toBe(2);
    expect(stats.dailyReadTimes.get('2026-06-01')).toBe(300);
    expect(stats.entriesByDate.get('2026-06-01')?.size).toBe(2);
    expect(stats.hasDetailData).toBe(true);
  });

  it('filters entries by selected date', () => {
    const entries = [
      {
        deviceId: 'd1',
        bookName: 'A',
        bookAuthor: '',
        readTime: 100,
        lastRead: new Date('2026-06-01T12:00:00').getTime(),
        durChapterTitle: '',
        durChapterIndex: 0,
        book: null,
        missingFromShelf: false,
        hasDurationRecord: true,
      },
      {
        deviceId: 'd1',
        bookName: 'B',
        bookAuthor: '',
        readTime: 200,
        lastRead: new Date('2026-06-02T12:00:00').getTime(),
        durChapterTitle: '',
        durChapterIndex: 0,
        book: null,
        missingFromShelf: false,
        hasDurationRecord: true,
      },
    ] satisfies ReadRecordEntry[];

    const stats = buildFallbackDailyStats(entries);
    const filtered = filterReadRecordEntriesByDate(entries, '2026-06-01', stats);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.bookName).toBe('A');
  });

  it('builds monday-first month grid', () => {
    const days = buildMonthCalendarDays(2026, 6);
    expect(days.length % 7).toBe(0);
    expect(days.some((day) => day.startsWith('2026-06-'))).toBe(true);
  });

  it('fills heatmap cells with fallback counts', () => {
    const entries = [
      {
        deviceId: 'd1',
        bookName: 'A',
        bookAuthor: '',
        readTime: 0,
        lastRead: new Date('2026-06-08T12:00:00').getTime(),
        durChapterTitle: '',
        durChapterIndex: 0,
        book: null,
        missingFromShelf: false,
        hasDurationRecord: false,
      },
    ] satisfies ReadRecordEntry[];

    const stats = buildFallbackDailyStats(entries);
    const cells = fillHeatmapCells(buildHeatmapCells('week', '2026-06-08'), stats);
    const active = cells.find((cell) => cell.readTimeSeconds > 0);
    expect(active?.dateKey).toBe('2026-06-08');
  });

  it('reads calendar cell value in time mode as minutes', () => {
    const stats = aggregateDailyReadStats([
      {
        deviceId: 'd1',
        bookName: 'A',
        bookAuthor: '',
        date: '2026-06-01',
        readTime: 180,
        readWords: 0,
        firstReadTime: 1,
        lastReadTime: 2,
      },
    ]);
    expect(getCalendarCellValue('2026-06-01', 'time', stats)).toBe(3);
    expect(getCalendarCellValue('2026-06-01', 'count', stats)).toBe(1);
  });
});
