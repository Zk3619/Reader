import { describe, expect, it } from 'vitest';

import {
  buildReadRecordArchiveRows,
  groupReadRecordEntriesByDate,
} from '@/lib/record/read-record-archive';
import { formatFriendlyDate } from '@/lib/record/read-record-format';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';

function entry(partial: Partial<ReadRecordEntry> & Pick<ReadRecordEntry, 'bookName'>): ReadRecordEntry {
  return {
    deviceId: 'dev',
    bookAuthor: '',
    readTime: 0,
    lastRead: 0,
    durChapterTitle: '',
    durChapterIndex: 0,
    book: null,
    missingFromShelf: false,
    hasDurationRecord: false,
    ...partial,
  };
}

describe('read-record-archive', () => {
  it('groups entries by local date', () => {
    const groups = groupReadRecordEntriesByDate([
      entry({ bookName: 'A', lastRead: new Date('2026-06-09T10:00:00').getTime() }),
      entry({ bookName: 'B', lastRead: new Date('2026-06-08T12:00:00').getTime() }),
      entry({
        bookName: 'C',
        lastRead: new Date('2026-06-09T20:00:00').getTime(),
        hasDurationRecord: true,
        readTime: 120,
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.date).toBe('2026-06-09');
    expect(groups[0]?.entries).toHaveLength(2);
    expect(groups[0]?.totalSeconds).toBe(120);
  });

  it('builds aggregate rows with date headers', () => {
    const rows = buildReadRecordArchiveRows(
      [
        entry({ bookName: 'A', lastRead: new Date('2026-06-09T10:00:00').getTime() }),
      ],
      'aggregate',
    );
    expect(rows[0]?.kind).toBe('date-header');
    expect(rows[1]?.kind).toBe('entry');
  });

  it('formats friendly date labels', () => {
    expect(formatFriendlyDate('2026-06-09')).toBe('今天');
  });
});
