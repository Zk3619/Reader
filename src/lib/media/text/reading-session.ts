/**
 * 阅读时长会话（对齐 Legado ReadRecord）
 */

import * as readRecordDetailsDb from '@/lib/database/read-record-details';
import * as readRecordsDb from '@/lib/database/read-records';
import { formatDateKey } from '@/lib/record/read-record-format';
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

import { settingsStore } from '@/stores/settings';

export function isReadRecordEnabled(): boolean {
  return settingsStore.state.app.enableReadRecord !== false;
}

export async function flushReadingSession(book?: Book | null): Promise<void> {
  if (!sessionBookKey) return;
  tickReadingSession();
  const delta = accumulatedMs;
  sessionBookKey = null;
  sessionStartMs = 0;
  accumulatedMs = 0;
  if (delta < 1000 || !book || !isReadRecordEnabled()) return;

  const deviceId = await getReaderDeviceId();
  const existing = await readRecordsDb.getReadRecord(
    deviceId,
    book.name,
    book.author ?? '',
  );
  const addedSeconds = Math.round(delta / 1000);
  const readTime = (existing?.readTime ?? 0) + addedSeconds;
  const now = Date.now();
  const dateKey = formatDateKey(now);

  await readRecordsDb.upsertReadRecord({
    deviceId,
    bookName: book.name,
    bookAuthor: book.author ?? '',
    readTime,
    lastRead: now,
    durChapterTitle: book.durChapterTitle ?? '',
    durChapterIndex: book.durChapterIndex ?? 0,
  });

  const existingDetail = await readRecordDetailsDb.getReadRecordDetail(
    deviceId,
    book.name,
    book.author ?? '',
    dateKey,
  );
  await readRecordDetailsDb.upsertReadRecordDetail({
    deviceId,
    bookName: book.name,
    bookAuthor: book.author ?? '',
    date: dateKey,
    readTime: (existingDetail?.readTime ?? 0) + addedSeconds,
    readWords: existingDetail?.readWords ?? 0,
    firstReadTime: existingDetail?.firstReadTime ?? now,
    lastReadTime: now,
  });

  window.dispatchEvent(new CustomEvent('read-record-updated'));
}
