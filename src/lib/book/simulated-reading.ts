/**
 * 模拟追更（对齐 Legado Book.readSimulating / simulatedTotalChapterNum）
 */

import type { Book } from '@/types';

export interface ReadSimulatingConfig {
  readSimulating?: boolean;
  /** YYYY-MM-DD */
  startDate?: string;
  startChapter?: number;
  dailyChapters?: number;
}

export function isReadSimulating(book: Book | null | undefined): boolean {
  return book?.readConfig?.readSimulating === true;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 可读章节数（含起始章，上限为 totalChapterNum） */
export function simulatedReadableChapterCount(book: Book): number {
  const total = book.totalChapterNum || 0;
  if (!isReadSimulating(book) || total <= 0) return total;

  const cfg = book.readConfig ?? {};
  const startDateStr = typeof cfg.startDate === 'string' ? cfg.startDate.trim() : '';
  const startDate = startDateStr ? parseLocalDate(startDateStr) : new Date();
  const daysPassed =
    Math.floor((startOfDay(new Date()) - startOfDay(startDate)) / 86_400_000) + 1;
  const startChapter = Number(cfg.startChapter ?? 0);
  const daily = Number(cfg.dailyChapters ?? 3);
  const unlocked = Math.max(0, startChapter + daysPassed * daily);
  return Math.min(total, unlocked);
}

/** 模拟追更下最后一章索引（catalog 长度可能小于 totalChapterNum） */
export function maxSimulatedChapterIndex(book: Book, catalogLength: number): number {
  if (catalogLength <= 0) return 0;
  if (!isReadSimulating(book)) return catalogLength - 1;
  const count = simulatedReadableChapterCount(book);
  return Math.max(0, Math.min(catalogLength - 1, count - 1));
}

export function formatTodayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
