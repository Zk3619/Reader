/**
 * 书籍章节缓存备份/恢复（对齐 Legado book_cache/ + bookCacheIndex.json）
 */

import { join } from '@tauri-apps/api/path';
import { strToU8 } from 'fflate';
import { bookCacheFolderKey } from '@/lib/chapter-cache/book-cache-key';
import { writeChapterFile } from '@/lib/chapter-cache/file-storage';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';
import * as booksDb from '@/lib/database/books';
import type { BackupItemInfo } from '@/lib/database/reader-backup';

export const BOOK_CACHE_ZIP_PREFIX = 'book_cache/';
export const BOOK_CACHE_INDEX_FILE = 'bookCacheIndex.json';

export interface BookCacheChapterInfo {
  index: number;
  title: string;
  fileName: string;
}

export interface BookCacheIndexEntry {
  bookUrl: string;
  bookName: string;
  author: string;
  folderName: string;
  chapters: BookCacheChapterInfo[];
}

const OPFS_CACHE_DIR = 'book-cache';

async function iterateDirEntries(
  dir: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const handle = dir as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (!handle.entries) return [];
  const out: Array<[string, FileSystemHandle]> = [];
  for await (const entry of handle.entries()) out.push(entry);
  return out;
}

async function getTauriCacheRoot(): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, OPFS_CACHE_DIR);
  return dir;
}

async function getOpfsCacheRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_CACHE_DIR, { create: false }).catch(() => {
    throw new Error('OPFS cache missing');
  });
}

async function listTauriFolderFiles(folderPath: string): Promise<string[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  if (!(await fileExists(folderPath))) return [];
  const entries = await readDir(folderPath);
  return entries.filter((e) => !e.isDirectory).map((e) => e.name);
}

async function readTauriFileBytes(filePath: string): Promise<Uint8Array | null> {
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function collectFromTauri(): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  const books = await booksDb.getAllBooks();
  const root = await getTauriCacheRoot();
  if (!(await fileExists(root))) return entries;

  const index: BookCacheIndexEntry[] = [];

  for (const book of books) {
    const folderName = bookCacheFolderKey(book.bookUrl, book.name);
    const bookDir = await join(root, folderName);
    if (!(await fileExists(bookDir))) continue;

    const files = await listTauriFolderFiles(bookDir);
    const chapters: BookCacheChapterInfo[] = [];

    for (const fileName of files) {
      if (!fileName.endsWith('.txt')) continue;
      const filePath = await join(bookDir, fileName);
      const bytes = await readTauriFileBytes(filePath);
      if (!bytes?.length) continue;
      const zipPath = `${BOOK_CACHE_ZIP_PREFIX}${folderName}/${fileName}`;
      entries[zipPath] = bytes;
      const indexMatch = /^(\d+)\.txt$/.exec(fileName);
      chapters.push({
        index: indexMatch ? Number(indexMatch[1]) : chapters.length,
        title: '',
        fileName,
      });
    }

    if (chapters.length > 0) {
      index.push({
        bookUrl: book.bookUrl,
        bookName: book.name,
        author: book.author ?? '',
        folderName,
        chapters: chapters.sort((a, b) => a.index - b.index),
      });
    }
  }

  if (index.length > 0) {
    entries[BOOK_CACHE_INDEX_FILE] = strToU8(JSON.stringify(index, null, 2));
  }
  return entries;
}

async function collectFromOpfs(): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  const books = await booksDb.getAllBooks();
  let root: FileSystemDirectoryHandle;
  try {
    root = await getOpfsCacheRoot();
  } catch {
    return entries;
  }

  const index: BookCacheIndexEntry[] = [];

  for (const book of books) {
    const folderName = bookCacheFolderKey(book.bookUrl, book.name);
    let bookDir: FileSystemDirectoryHandle;
    try {
      bookDir = await root.getDirectoryHandle(folderName);
    } catch {
      continue;
    }

    const chapters: BookCacheChapterInfo[] = [];
    for (const [fileName, handle] of await iterateDirEntries(bookDir)) {
      if (handle.kind !== 'file' || !fileName.endsWith('.txt')) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      const zipPath = `${BOOK_CACHE_ZIP_PREFIX}${folderName}/${fileName}`;
      entries[zipPath] = strToU8(text);
      const indexMatch = /^(\d+)\.txt$/.exec(fileName);
      chapters.push({
        index: indexMatch ? Number(indexMatch[1]) : chapters.length,
        title: '',
        fileName,
      });
    }

    if (chapters.length > 0) {
      index.push({
        bookUrl: book.bookUrl,
        bookName: book.name,
        author: book.author ?? '',
        folderName,
        chapters: chapters.sort((a, b) => a.index - b.index),
      });
    }
  }

  if (index.length > 0) {
    entries[BOOK_CACHE_INDEX_FILE] = strToU8(JSON.stringify(index, null, 2));
  }
  return entries;
}

export async function collectBookCacheZipEntries(): Promise<{
  entries: Record<string, Uint8Array>;
  item?: BackupItemInfo;
}> {
  const entries = isTauri() ? await collectFromTauri() : await collectFromOpfs();
  const fileCount = Object.keys(entries).filter((k) => k.startsWith(BOOK_CACHE_ZIP_PREFIX)).length;
  if (fileCount === 0) return { entries: {} };

  const totalSize = Object.values(entries).reduce((sum, b) => sum + b.byteLength, 0);
  return {
    entries,
    item: {
      fileName: 'book_cache',
      displayName: '书籍章节缓存',
      description: '离线章节正文缓存',
      count: fileCount,
      size: totalSize,
    },
  };
}

export async function restoreBookCacheFromZip(
  binary: Record<string, Uint8Array>,
  text: Record<string, string>,
): Promise<number> {
  let restored = 0;
  const indexText = text[BOOK_CACHE_INDEX_FILE.toLowerCase()] ?? text[BOOK_CACHE_INDEX_FILE];
  let index: BookCacheIndexEntry[] = [];
  if (indexText) {
    try {
      index = JSON.parse(indexText) as BookCacheIndexEntry[];
    } catch {
      index = [];
    }
  }

  const urlByFolder = new Map(index.map((e) => [e.folderName, e.bookUrl]));
  const nameByFolder = new Map(index.map((e) => [e.folderName, e.bookName]));

  for (const [path, data] of Object.entries(binary)) {
    const norm = path.replace(/\\/g, '/');
    if (!norm.startsWith(BOOK_CACHE_ZIP_PREFIX)) continue;
    const rel = norm.slice(BOOK_CACHE_ZIP_PREFIX.length);
    const slash = rel.indexOf('/');
    if (slash <= 0) continue;
    const folderName = rel.slice(0, slash);
    const fileName = rel.slice(slash + 1);
    const indexMatch = /^(\d+)\.txt$/.exec(fileName);
    if (!indexMatch) continue;

    const bookUrl = urlByFolder.get(folderName);
    if (!bookUrl) continue;
    const chapterIndex = Number(indexMatch[1]);
    const content = new TextDecoder().decode(data);
    await writeChapterFile(bookUrl, nameByFolder.get(folderName), chapterIndex, content);
    restored += 1;
  }
  return restored;
}
