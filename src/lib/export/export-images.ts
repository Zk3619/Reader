/**
 * 导出已缓存漫画插图：ZIP 压缩包或指定目录（对齐 Legado CacheBook 离线存图）
 */

import { save } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { zipSync, strToU8 } from 'fflate';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { shouldFetchReaderInlineImageAsBlob } from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { flowImageRefs } from '@/lib/media/image/flow-images';
import type { ReaderInlineImageRef } from '@/lib/media/text/reader-content-blocks';
import {
  listMangaImageRecordsForBook,
  readMangaImageFromDisk,
} from '@/lib/media/image/image-disk-cache';
import {
  cacheMangaImagesFromChapterHtml,
  loadMangaImageObjectUrl,
} from '@/lib/media/image/image-loader';
import { isLocalBook } from '@/lib/local-book';
import { isTauri } from '@/lib/platform/detect';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { FsUserCancelledError, isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import {
  rememberExportDirectory,
  rememberExportFilePath,
  resolveExportDialogDefaultPath,
  resolveSilentExportDirectory,
  resolveSilentExportFilePath,
} from '@/lib/export/export-location';
import {
  imageExtensionForMime,
  type ImageTargetFormat,
} from '@/lib/export/image-format-convert';
import {
  convertImageForExport,
  resolveMediaConvertCapabilities,
} from '@/lib/media/media-convert';
import type { ExportProgressCallback } from '@/lib/export/export-progress';
import type { Book } from '@/types';

export class ExportMangaImagesCancelledError extends Error {
  constructor() {
    super('用户取消导出');
    this.name = 'ExportMangaImagesCancelledError';
  }
}

export type ExportMangaImagesFormat = 'zip' | 'folder';

export interface ExportMangaImagesOptions {
  startIndex?: number;
  endIndex?: number;
  /** 仅导出磁盘已缓存图片；为 false 时会尝试拉取缺失图 */
  onlyCached?: boolean;
  format?: ExportMangaImagesFormat;
  /** 按章节分目录存放（默认 true） */
  groupByChapter?: boolean;
  targetFormat?: ImageTargetFormat;
  onProgress?: ExportProgressCallback;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

function chapterImageFileName(
  chapterIndex: number,
  pageIndex: number,
  mime: string,
  chapterTitle?: string,
  groupByChapter = true,
): string {
  const ext = imageExtensionForMime(mime);
  const pg = String(pageIndex + 1).padStart(3, '0');
  if (!groupByChapter) {
    const ch = String(chapterIndex + 1).padStart(4, '0');
    return `${ch}_${pg}.${ext}`;
  }
  const chDir = `${String(chapterIndex + 1).padStart(4, '0')}_${sanitizeFileName(chapterTitle ?? 'chapter').slice(0, 40)}`;
  return `${chDir}/${pg}.${ext}`;
}

async function resolveImageBytes(
  book: Book,
  chapterIndex: number,
  pageIndex: number,
  imageUrl: string,
  legadoHeaders: Record<string, string> | undefined,
  source: Awaited<ReturnType<typeof sourcesDb.getSource>>,
  chapterUrl: string | undefined,
  onlyCached: boolean,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  const disk = await readMangaImageFromDisk(imageUrl, sourceId);
  if (disk) return { bytes: disk.bytes, mime: disk.meta.mime };

  if (onlyCached) return null;

  const blobUrl = await loadMangaImageObjectUrl(imageUrl, {
    bookUrl: book.bookUrl,
    chapterIndex,
    pageIndex,
    referer: chapterUrl,
    source,
    legadoImageHeaders: legadoHeaders,
    readerInlineQueue: true,
    readerInlineQueuePriority: 'low',
  });
  if (!blobUrl) return null;
  try {
    const res = await fetch(blobUrl);
    const buf = await res.arrayBuffer();
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    return { bytes: buf, mime };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function collectMangaImagesForExport(
  book: Book,
  options?: ExportMangaImagesOptions,
): Promise<Map<string, { bytes: ArrayBuffer; mime: string }>> {
  if (isLocalBook(book)) {
    throw new Error('本地书暂不支持导出漫画图片');
  }

  const chapters = await chaptersDb.getChapterList(book.bookUrl);
  if (chapters.length === 0) {
    throw new Error('该书暂无章节目录');
  }

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) {
    throw new Error('书源不存在或已禁用');
  }

  const onlyCached = options?.onlyCached ?? true;
  const start = options?.startIndex ?? 0;
  const end = options?.endIndex ?? chapters.length - 1;
  const groupByChapter = options?.groupByChapter ?? true;
  const targetFormat = options?.targetFormat ?? 'original';
  const files = new Map<string, { bytes: ArrayBuffer; mime: string }>();
  const convertCaps =
    targetFormat !== 'original'
      ? await resolveMediaConvertCapabilities()
      : undefined;

  let totalPages = 0;
  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim()) continue;
    totalPages += flowImageRefs(raw, ch.url ?? ch.baseUrl ?? '').length;
  }
  totalPages = Math.max(1, totalPages);
  let processed = 0;

  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim()) continue;

    const refs = flowImageRefs(raw, ch.url ?? ch.baseUrl ?? '');
    for (let pageIndex = 0; pageIndex < refs.length; pageIndex++) {
      const ref = refs[pageIndex];
      const data = await resolveImageBytes(
        book,
        i,
        pageIndex,
        ref.url,
        ref.legadoHeaders,
        source,
        ch.url ?? ch.baseUrl,
        onlyCached,
      );
      processed += 1;
      options?.onProgress?.({
        phase: '收集图片',
        current: processed,
        total: totalPages,
      });
      if (!data) continue;
      const converted = await convertImageForExport(
        data.bytes,
        data.mime,
        targetFormat,
        convertCaps,
      );
      const name = chapterImageFileName(
        i,
        pageIndex,
        converted.mime,
        ch.title,
        groupByChapter,
      );
      files.set(name, converted);
    }
  }

  return files;
}

async function saveZipArchive(
  book: Book,
  files: Map<string, { bytes: ArrayBuffer; mime: string }>,
): Promise<void> {
  if (files.size === 0) {
    throw new Error('没有可导出的漫画图片（请先缓存章节或阅读生成图片缓存）');
  }

  const zipEntries: Record<string, Uint8Array> = {
    'README.txt': strToU8(
      `《${book.name}》漫画图片导出\n共 ${files.size} 张\n`,
    ),
  };
  for (const [name, { bytes }] of files) {
    zipEntries[name] = new Uint8Array(bytes);
  }
  const zipped = zipSync(zipEntries);
  const fileName = `${sanitizeFileName(book.name)}_images.zip`;

  if (isTauri()) {
    const silentPath = await resolveSilentExportFilePath('reading', fileName);
    if (silentPath) {
      await writeFile(silentPath, zipped);
      await rememberExportFilePath(silentPath);
      return;
    }
    const defaultPath = await resolveExportDialogDefaultPath(fileName);
    const path = await save({
      defaultPath,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!path) throw new ExportMangaImagesCancelledError();
    await writeFile(path, zipped);
    await rememberExportFilePath(path);
    return;
  }

  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function saveToFolder(
  book: Book,
  files: Map<string, { bytes: ArrayBuffer; mime: string }>,
): Promise<void> {
  if (files.size === 0) {
    throw new Error('没有可导出的漫画图片（请先缓存章节或阅读生成图片缓存）');
  }

  if (isTauri()) {
    const silentDir = await resolveSilentExportDirectory('reading');
    const basePath = silentDir ?? formatStorageRef((await pickDirectory()).ref);
    if (!basePath) throw new ExportMangaImagesCancelledError();
    await rememberExportDirectory(basePath);
    const bookDir = await join(basePath, sanitizeFileName(book.name));
    await mkdir(bookDir, { recursive: true });
    for (const [name, { bytes }] of files) {
      await writeFile(await join(bookDir, name), new Uint8Array(bytes));
    }
    return;
  }

  throw new Error('当前环境请使用 ZIP 导出；桌面版支持导出到文件夹');
}

export async function exportMangaImages(
  book: Book,
  options?: ExportMangaImagesOptions,
): Promise<{ exported: number }> {
  const format = options?.format ?? 'zip';
  const files = await collectMangaImagesForExport(book, options);
  options?.onProgress?.({
    phase: '写入文件',
    current: 0,
    total: 1,
  });
  if (format === 'folder') {
    await saveToFolder(book, files);
  } else {
    await saveZipArchive(book, files);
  }
  options?.onProgress?.({
    phase: '完成',
    current: 1,
    total: 1,
  });
  return { exported: files.size };
}

export type WarmMangaChapterResult = {
  /** 需拉取落盘的插图总数（不含 data: 与直链图） */
  totalImages: number;
  /** 磁盘上已有的插图数 */
  cachedImages: number;
  /** 全部需拉取的图均已落盘 */
  complete: boolean;
};

/** 章节正文中需走 blob 拉取并落盘的插图 */
export function listFetchableMangaImageRefs(
  raw: string,
  chapterUrl = '',
): ReaderInlineImageRef[] {
  return flowImageRefs(raw, chapterUrl).filter((ref) => {
    const norm = normalizeImageUrl(ref.url?.trim() ?? '');
    if (!norm || norm.startsWith('data:')) return false;
    return shouldFetchReaderInlineImageAsBlob(norm, {
      legadoImageHeaders: ref.legadoHeaders,
    });
  });
}

/** 离线缓存：将一章漫画插图写入磁盘并校验是否全部完成 */
export async function warmMangaImagesForCachedChapter(
  book: Book,
  chapterIndex: number,
  raw: string,
  chapterUrl?: string,
): Promise<WarmMangaChapterResult> {
  const source = await sourcesDb.getSource(book.origin);
  const fetchable = listFetchableMangaImageRefs(raw, chapterUrl ?? '');
  if (fetchable.length === 0) {
    return { totalImages: 0, cachedImages: 0, complete: true };
  }

  await cacheMangaImagesFromChapterHtml(book.bookUrl, chapterIndex, raw, {
    chapterUrl,
    source,
    referer: chapterUrl,
  });

  const sourceId = source?.sourceUrl ?? source?.sourceName;
  let onDisk = 0;
  for (const ref of fetchable) {
    const disk = await readMangaImageFromDisk(ref.url, sourceId);
    if (disk) onDisk += 1;
  }

  return {
    totalImages: fetchable.length,
    cachedImages: onDisk,
    complete: onDisk >= fetchable.length,
  };
}

export async function getExportableMangaImageCount(book: Book): Promise<number> {
  const stats = await listMangaImageRecordsForBook(book.bookUrl);
  return stats.length;
}

export function isExportCancelledError(e: unknown): boolean {
  return (
    e instanceof ExportMangaImagesCancelledError ||
    e instanceof FsUserCancelledError ||
    isUserCancelled(e)
  );
}
