/**
 * 日级阅读统计（对齐 legado ReadRecordDetail 聚合）
 */

import * as readRecordDetailsDb from '@/lib/database/read-record-details';
import { formatDateKey } from '@/lib/record/read-record-format';
import { readRecordEntryKey } from '@/lib/record/read-record-layout';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';
import type { ReadRecordDetail } from '@/types';

export type HeatmapCalendarMode = 'count' | 'time';

export type HeatmapPeriod = 'year' | 'half-year' | 'quarter' | 'month' | 'week';

export const HEATMAP_PERIOD_LABELS: Record<HeatmapPeriod, string> = {
  year: '一年',
  'half-year': '半年',
  quarter: '三月',
  month: '一月',
  week: '一周',
};

/** 各时间段天数（7 的倍数以对齐周列） */
export const HEATMAP_PERIOD_DAYS: Record<HeatmapPeriod, number> = {
  year: 364,
  'half-year': 182,
  quarter: 91,
  month: 35,
  week: 7,
};

export const HEATMAP_COUNT_BASELINE = 6;
export const HEATMAP_TIME_BASELINE_MINUTES = 120;

export type DailyReadStats = {
  dailyReadCounts: Map<string, number>;
  dailyReadTimes: Map<string, number>;
  /** 各日期有阅读记录的书籍键（deviceId 无关，按书名+作者） */
  entriesByDate: Map<string, Set<string>>;
  hasDetailData: boolean;
};

export type HeatmapCell = {
  dateKey: string;
  readTimeSeconds: number;
};

export function aggregateDailyReadStats(details: readonly ReadRecordDetail[]): DailyReadStats {
  const dailyReadCounts = new Map<string, number>();
  const dailyReadTimes = new Map<string, number>();
  const entriesByDate = new Map<string, Set<string>>();

  for (const detail of details) {
    if (!detail.date) continue;
    dailyReadCounts.set(detail.date, (dailyReadCounts.get(detail.date) ?? 0) + 1);
    dailyReadTimes.set(
      detail.date,
      (dailyReadTimes.get(detail.date) ?? 0) + Math.max(0, detail.readTime),
    );
    const bookKey = readRecordEntryKey(detail.bookName, detail.bookAuthor);
    const bucket = entriesByDate.get(detail.date);
    if (bucket) bucket.add(bookKey);
    else entriesByDate.set(detail.date, new Set([bookKey]));
  }

  return { dailyReadCounts, dailyReadTimes, entriesByDate, hasDetailData: details.length > 0 };
}

/** 无明细表数据时，用 lastRead 推断活跃天数（仅次数） */
export function buildFallbackDailyStats(entries: readonly ReadRecordEntry[]): DailyReadStats {
  const dailyReadCounts = new Map<string, number>();
  const dailyReadTimes = new Map<string, number>();
  const entriesByDate = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!entry.lastRead || entry.lastRead <= 0) continue;
    const dateKey = formatDateKey(entry.lastRead);
    dailyReadCounts.set(dateKey, (dailyReadCounts.get(dateKey) ?? 0) + 1);
    const bookKey = readRecordEntryKey(entry.bookName, entry.bookAuthor);
    const bucket = entriesByDate.get(dateKey);
    if (bucket) bucket.add(bookKey);
    else entriesByDate.set(dateKey, new Set([bookKey]));
  }

  return { dailyReadCounts, dailyReadTimes, entriesByDate, hasDetailData: false };
}

export async function loadDailyReadStats(
  entries?: readonly ReadRecordEntry[],
): Promise<DailyReadStats> {
  const details = await readRecordDetailsDb.getAllReadRecordDetails();
  if (details.length > 0) return aggregateDailyReadStats(details);
  if (entries) return buildFallbackDailyStats(entries);
  return {
    dailyReadCounts: new Map(),
    dailyReadTimes: new Map(),
    entriesByDate: new Map(),
    hasDetailData: false,
  };
}

/** 按日历选中日期筛选阅读记录（对齐 legados-main selectedDate） */
export function readRecordEntryMatchesDate(
  entry: ReadRecordEntry,
  dateKey: string | null | undefined,
  stats?: DailyReadStats,
): boolean {
  if (!dateKey) return true;

  const keys = stats?.entriesByDate.get(dateKey);
  if (keys && keys.size > 0) {
    return keys.has(readRecordEntryKey(entry.bookName, entry.bookAuthor));
  }

  return entry.lastRead > 0 && formatDateKey(entry.lastRead) === dateKey;
}

export function filterReadRecordEntriesByDate(
  entries: readonly ReadRecordEntry[],
  dateKey: string | null | undefined,
  stats?: DailyReadStats,
): readonly ReadRecordEntry[] {
  if (!dateKey) return entries;
  return entries.filter((entry) => readRecordEntryMatchesDate(entry, dateKey, stats));
}

export function parseDateKey(dateKey: string): Date | null {
  const parts = dateKey.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatDateKeyFromParts(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return formatDateKey(date.getTime());
}

export function startOfMonth(year: number, month: number): string {
  return formatDateKeyFromParts(year, month, 1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 月历网格：从该月所在周的周一开始，补全前后月日期 */
export function buildMonthCalendarDays(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1);
  const lastDay = daysInMonth(year, month);
  const start = new Date(first);
  const weekday = start.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  start.setDate(start.getDate() + mondayOffset);

  const end = new Date(year, month - 1, lastDay);
  const endWeekday = end.getDay();
  const sundayOffset = endWeekday === 0 ? 0 : 7 - endWeekday;
  end.setDate(end.getDate() + sundayOffset);

  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(formatDateKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isSameMonth(dateKey: string, year: number, month: number): boolean {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  return date.getFullYear() === year && date.getMonth() + 1 === month;
}

export function getCalendarCellValue(
  dateKey: string,
  mode: HeatmapCalendarMode,
  stats: DailyReadStats,
): number {
  if (mode === 'count') return stats.dailyReadCounts.get(dateKey) ?? 0;
  return Math.floor((stats.dailyReadTimes.get(dateKey) ?? 0) / 60);
}

export function getCalendarMaxValue(
  mode: HeatmapCalendarMode,
  stats: DailyReadStats,
): number {
  if (mode === 'count') {
    const max = Math.max(0, ...stats.dailyReadCounts.values());
    return Math.max(max, HEATMAP_COUNT_BASELINE);
  }
  const maxSeconds = Math.max(0, ...stats.dailyReadTimes.values());
  const maxMinutes = Math.floor(maxSeconds / 60);
  return Math.max(maxMinutes, HEATMAP_TIME_BASELINE_MINUTES);
}

export function heatmapIntensity(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) return 0;
  const ratio = Math.min(1, value / maxValue);
  return ratio * ratio;
}

export function buildHeatmapCells(
  period: HeatmapPeriod,
  endDateKey?: string,
): HeatmapCell[] {
  const end = endDateKey ?? formatDateKey(Date.now());
  const totalDays = HEATMAP_PERIOD_DAYS[period];
  const start = addDays(end, -(totalDays - 1));
  const cells: HeatmapCell[] = [];

  for (let i = 0; i < totalDays; i += 1) {
    const dateKey = addDays(start, i);
    cells.push({ dateKey, readTimeSeconds: 0 });
  }
  return cells;
}

export function fillHeatmapCells(
  cells: HeatmapCell[],
  stats: DailyReadStats,
): HeatmapCell[] {
  return cells.map((cell) => {
    const detailSeconds = stats.dailyReadTimes.get(cell.dateKey) ?? 0;
    const fallbackCount = stats.dailyReadCounts.get(cell.dateKey) ?? 0;
    return {
      ...cell,
      readTimeSeconds: stats.hasDetailData
        ? detailSeconds
        : fallbackCount > 0
          ? fallbackCount * 60
          : 0,
    };
  });
}

export function heatmapMonthLabels(cells: HeatmapCell[]): string[] {
  if (cells.length === 0) return [];
  const indices = [0, Math.floor((cells.length - 1) / 2), cells.length - 1];
  const seen = new Set<number>();
  const labels: string[] = [];

  for (const index of indices) {
    if (seen.has(index)) continue;
    seen.add(index);
    const date = parseDateKey(cells[index]!.dateKey);
    if (!date) continue;
    labels.push(`${date.getMonth() + 1}月`);
  }
  return labels;
}

export function formatSelectedDateLabel(dateKey: string): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'] as const;
  const w = weekdays[date.getDay()] ?? '';
  return `${date.getMonth() + 1}月${date.getDate()}日 周${w}`;
}
