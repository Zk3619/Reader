import {
  loadUnifiedReadingHistory,
  type UnifiedReadingItem,
} from '@/lib/record/reading-history';
import type { ReadRecord } from '@/types';

export type ReadRecordEntry = ReadRecord & {
  book: UnifiedReadingItem['book'];
  missingFromShelf: boolean;
  hasDurationRecord: boolean;
};

export type ReadRecordStats = {
  totalSeconds: number;
  bookCount: number;
  latestLastRead: number | null;
};

function toReadRecordEntry(item: UnifiedReadingItem): ReadRecordEntry {
  return {
    deviceId: item.deviceId,
    bookName: item.bookName,
    bookAuthor: item.bookAuthor,
    readTime: item.readTime,
    lastRead: item.lastRead,
    durChapterTitle: item.durChapterTitle,
    durChapterIndex: item.durChapterIndex,
    book: item.book,
    missingFromShelf: item.missingFromShelf,
    hasDurationRecord: item.hasDurationRecord,
  };
}

export async function loadReadRecordEntries(): Promise<ReadRecordEntry[]> {
  const items = await loadUnifiedReadingHistory();
  return items.map(toReadRecordEntry);
}

export function computeReadRecordStats(entries: ReadRecordEntry[]): ReadRecordStats {
  const durationEntries = entries.filter((e) => e.hasDurationRecord && e.readTime > 0);
  if (durationEntries.length === 0) {
    const latest = entries[0]?.lastRead ?? null;
    return {
      totalSeconds: 0,
      bookCount: entries.length,
      latestLastRead: latest && latest > 0 ? latest : null,
    };
  }

  let totalSeconds = 0;
  let latestLastRead = 0;
  for (const entry of entries) {
    if (entry.lastRead > latestLastRead) latestLastRead = entry.lastRead;
    if (entry.hasDurationRecord) totalSeconds += entry.readTime;
  }

  return {
    totalSeconds,
    bookCount: entries.length,
    latestLastRead: latestLastRead > 0 ? latestLastRead : null,
  };
}
