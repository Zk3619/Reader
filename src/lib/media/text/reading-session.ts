/**
 * 阅读时长会话（对齐 Legado ReadRecord）
 */

import * as readRecordsDb from '@/lib/database/read-records';
import { getReaderDeviceId } from '@/lib/media/text/device-id';
import type { Book } from '@/types';

let sessionBookKey: string | null = null;
let sessionStartMs = 0;
let accumulatedMs = 0;

function bookKey(book: Book): string {
  return `${book.name}\0${book.author ?? ''}`;
}

export function startReadingSession(book: Book): void {
  const key = bookKey(book);
  if (sessionBookKey === key) return;
  flushReadingSession();
  sessionBookKey = key;
  sessionStartMs = Date.now();
  accumulatedMs = 0;
}

export function tickReadingSession(): void {
  if (!sessionBookKey || sessionStartMs <= 0) return;
  const now = Date.now();
  accumulatedMs += now - sessionStartMs;
  sessionStartMs = now;
}

export async function flushReadingSession(book?: Book | null): Promise<void> {
  if (!sessionBookKey) return;
  tickReadingSession();
  const delta = accumulatedMs;
  sessionBookKey = null;
  sessionStartMs = 0;
  accumulatedMs = 0;
  if (delta < 1000 || !book) return;

  const deviceId = await getReaderDeviceId();
  const existing = await readRecordsDb.getReadRecord(
    deviceId,
    book.name,
    book.author ?? '',
  );
  const readTime = (existing?.readTime ?? 0) + Math.round(delta / 1000);
  await readRecordsDb.upsertReadRecord({
    deviceId,
    bookName: book.name,
    bookAuthor: book.author ?? '',
    readTime,
    lastRead: Date.now(),
    durChapterTitle: book.durChapterTitle ?? '',
    durChapterIndex: book.durChapterIndex ?? 0,
  });
}
