/**
 * WebDAV 阅读进度云同步（对齐 Legado AppWebDav bookProgress/）
 */

import { WebDavClient } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import { isSyncBookProgressEnabled } from '@/lib/backup/backup-config-storage';
import * as booksDb from '@/lib/database/books';
import type { Book, BookProgress } from '@/types';

const BOOK_PROGRESS_DIR = 'bookProgress';

function normalizeProgressFileName(name: string, author: string): string {
  const raw = `${name}_${author || ''}`
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return `${encodeURIComponent(raw)}.json`;
}

async function getProgressClient(): Promise<WebDavClient | null> {
  const config = await loadWebDavConfig();
  if (!config) return null;
  const root = buildRootWebDavUrl(config);
  const client = new WebDavClient(`${root}${BOOK_PROGRESS_DIR}`, config.username, config.password);
  await client.ensureDirectories(['']);
  return client;
}

export function bookToProgress(book: Book): BookProgress {
  return {
    name: book.name,
    author: book.author ?? '',
    durChapterIndex: book.durChapterIndex ?? 0,
    durChapterPos: book.durChapterPos ?? 0,
    durChapterTitle: book.durChapterTitle,
    durChapterTime: book.durChapterTime ?? 0,
  };
}

export async function uploadBookProgressToWebDav(book: Book): Promise<boolean> {
  if (!(await isSyncBookProgressEnabled())) return false;
  const config = await loadWebDavConfig();
  if (!config) return false;

  try {
    const progress = bookToProgress(book);
    const fileName = normalizeProgressFileName(progress.name, progress.author);
    const json = JSON.stringify(progress);
    const root = buildRootWebDavUrl(config);
    const client = new WebDavClient(root, config.username, config.password);
    await client.ensureDirectories([BOOK_PROGRESS_DIR]);
    await client.uploadFile(`${BOOK_PROGRESS_DIR}/${fileName}`, new TextEncoder().encode(json));
    await booksDb.updateBook({ ...book, syncTime: Date.now() });
    return true;
  } catch (error) {
    console.warn('[webdav-progress] upload failed', error);
    return false;
  }
}

export async function getBookProgressFromWebDav(name: string, author: string): Promise<BookProgress | null> {
  const config = await loadWebDavConfig();
  if (!config) return null;
  try {
    const fileName = normalizeProgressFileName(name, author);
    const root = buildRootWebDavUrl(config);
    const client = new WebDavClient(root, config.username, config.password);
    const buffer = await client.downloadFile(`${BOOK_PROGRESS_DIR}/${fileName}`);
    const json = new TextDecoder().decode(buffer);
    if (!json.trim().startsWith('{')) return null;
    return JSON.parse(json) as BookProgress;
  } catch {
    return null;
  }
}

export async function downloadAllBookProgressFromWebDav(): Promise<number> {
  if (!(await isSyncBookProgressEnabled())) return 0;
  const client = await getProgressClient();
  if (!client) return 0;

  const files = await client.listFiles('');
  const fileMap = new Map(files.filter((f) => !f.isDir).map((f) => [f.displayName, f]));
  const books = await booksDb.getAllBooks();
  let updated = 0;

  for (const book of books) {
    const fileName = normalizeProgressFileName(book.name, book.author ?? '');
    const remote = fileMap.get(fileName);
    if (!remote) continue;
    if (remote.lastModify <= (book.syncTime ?? 0)) continue;

    const progress = await getBookProgressFromWebDav(book.name, book.author ?? '');
    if (!progress) continue;

    const remoteIndex = progress.durChapterIndex ?? 0;
    const remotePos = progress.durChapterPos ?? 0;
    const localIndex = book.durChapterIndex ?? 0;
    const localPos = book.durChapterPos ?? 0;

    if (remoteIndex > localIndex || (remoteIndex === localIndex && remotePos > localPos)) {
      await booksDb.updateBook({
        ...book,
        durChapterIndex: remoteIndex,
        durChapterPos: remotePos,
        durChapterTitle: progress.durChapterTitle ?? book.durChapterTitle,
        durChapterTime: progress.durChapterTime ?? book.durChapterTime,
        syncTime: Date.now(),
      });
      updated += 1;
    }
  }
  return updated;
}
