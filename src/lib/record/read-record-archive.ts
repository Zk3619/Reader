import { formatDateKey } from '@/lib/record/read-record-format';
import { readRecordEntryKey } from '@/lib/record/read-record-layout';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';

/** 归档区展示模式（对齐 legados-main DisplayMode 子集） */
export type ReadRecordArchiveMode = 'latest' | 'aggregate' | 'duration';

export const READ_RECORD_ARCHIVE_MODE_LABELS: Record<ReadRecordArchiveMode, string> = {
  latest: '按时间',
  aggregate: '按日期',
  duration: '按时长',
};

export const READ_RECORD_ARCHIVE_MODE_HINTS: Record<ReadRecordArchiveMode, string> = {
  latest: '按最后阅读时间排序，展示完整阅读记录',
  aggregate: '按日期分组汇总，查看每日阅读情况',
  duration: '按累计阅读时长排序',
};

export type ReadRecordArchiveDateGroup = {
  date: string;
  entries: ReadRecordEntry[];
  totalSeconds: number;
};

export type ReadRecordArchiveVirtualRow =
  | {
      kind: 'date-header';
      date: string;
      totalSeconds: number;
      key: string;
    }
  | {
      kind: 'entry';
      entry: ReadRecordEntry;
      key: string;
    };

export function groupReadRecordEntriesByDate(
  entries: readonly ReadRecordEntry[],
): ReadRecordArchiveDateGroup[] {
  const map = new Map<string, ReadRecordEntry[]>();
  for (const entry of entries) {
    const date = formatDateKey(entry.lastRead);
    const bucket = map.get(date);
    if (bucket) bucket.push(entry);
    else map.set(date, [entry]);
  }

  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, groupEntries]) => ({
      date,
      entries: [...groupEntries].sort((a, b) => b.lastRead - a.lastRead),
      totalSeconds: groupEntries.reduce(
        (sum, e) => sum + (e.hasDurationRecord ? e.readTime : 0),
        0,
      ),
    }));
}

export function buildReadRecordArchiveRows(
  entries: readonly ReadRecordEntry[],
  mode: ReadRecordArchiveMode,
): ReadRecordArchiveVirtualRow[] {
  if (mode === 'aggregate') {
    const rows: ReadRecordArchiveVirtualRow[] = [];
    for (const group of groupReadRecordEntriesByDate(entries)) {
      rows.push({
        kind: 'date-header',
        date: group.date,
        totalSeconds: group.totalSeconds,
        key: `date-${group.date}`,
      });
      for (const entry of group.entries) {
        rows.push({
          kind: 'entry',
          entry,
          key: readRecordEntryKey(entry.bookName, entry.bookAuthor),
        });
      }
    }
    return rows;
  }

  const sorted =
    mode === 'duration'
      ? [...entries]
          .filter((e) => e.hasDurationRecord && e.readTime > 0)
          .sort((a, b) => b.readTime - a.readTime)
      : [...entries].sort((a, b) => b.lastRead - a.lastRead);

  return sorted.map((entry) => ({
    kind: 'entry' as const,
    entry,
    key: readRecordEntryKey(entry.bookName, entry.bookAuthor),
  }));
}

const ARCHIVE_MODE_STORAGE_KEY = 'reader_read_record_archive_mode';

export function loadReadRecordArchiveMode(): ReadRecordArchiveMode {
  if (typeof localStorage === 'undefined') return 'latest';
  const raw = localStorage.getItem(ARCHIVE_MODE_STORAGE_KEY);
  if (raw === 'aggregate' || raw === 'duration' || raw === 'latest') return raw;
  return 'latest';
}

export function saveReadRecordArchiveMode(mode: ReadRecordArchiveMode): void {
  try {
    localStorage.setItem(ARCHIVE_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
