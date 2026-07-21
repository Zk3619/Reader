/**
 * 导出已缓存听书音频：ZIP 压缩包或指定目录
 */

import { save } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { zipSync, strToU8 } from 'fflate';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { parseParsedAudioUrls } from '@/lib/media/audio/parsed-audio-url';
import { fetchAudioBlobSrc } from '@/lib/media/audio/resolve-audio-playback';
import {
  listAudioRecordsForBook,
  readAudioFromDisk,
  writeAudioToDisk,
} from '@/lib/media/audio/audio-disk-cache';
import { isLocalBook } from '@/lib/local-book';
import { isTauri } from '@/lib/platform/detect';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { FsUserCancelledError, isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import { saveBinaryFile } from '@/lib/export/save-binary-file';
import type { ExportProgressCallback } from '@/lib/export/export-progress';
import type { AudioTargetFormat } from '@/lib/export/cache-export-types';
import {
  convertAudioForExport,
  resolveMediaConvertCapabilities,
} from '@/lib/media/media-convert';
import type { Book, BookChapter } from '@/types';
import {
  rememberExportDirectory,
  rememberExportFilePath,
  resolveExportDialogDefaultPath,
  resolveSilentExportDirectory,
  resolveSilentExportFilePath,
} from '@/lib/export/export-location';

export class ExportChapterAudioCancelledError extends Error {
  constructor() {
    super('用户取消导出');
    this.name = 'ExportChapterAudioCancelledError';
  }
}

export type ExportChapterAudioFormat = 'zip' | 'folder';

export interface ExportChapterAudioOptions {
  startIndex?: number;
  endIndex?: number;
  onlyCached?: boolean;
  format?: ExportChapterAudioFormat;
  targetFormat?: AudioTargetFormat;
  mergeSingle?: boolean;
  onProgress?: ExportProgressCallback;
}

export type WarmAudioChapterResult = {
  totalTracks: number;
  cachedTracks: number;
  complete: boolean;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

function audioExtension(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('aac')) return 'aac';
  if (m.includes('flac')) return 'flac';
  return 'audio';
}

function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    out.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return out.buffer;
}

function mergeAudioFiles(
  files: Map<string, { bytes: ArrayBuffer; mime: string }>,
  bookName: string,
): Map<string, { bytes: ArrayBuffer; mime: string }> {
  if (files.size <= 1) return files;
  const sorted = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  const mimes = new Set(sorted.map(([, v]) => v.mime.toLowerCase()));
  const canConcat =
    mimes.size === 1 &&
    [...mimes].every((m) => m.includes('mpeg') || m.includes('mp3'));
  if (!canConcat) {
    return files;
  }
  const sourceMime = sorted[0]![1].mime;
  const ext = audioExtension(sourceMime);
  const merged = concatArrayBuffers(sorted.map(([, v]) => v.bytes));
  return new Map([
    [
      `${sanitizeFileName(bookName)}_merged.${ext}`,
      { bytes: merged, mime: sourceMime },
    ],
  ]);
}

function chapterAudioFileName(
  chapterIndex: number,
  segmentIndex: number,
  mime: string,
  title?: string,
): string {
  const ch = String(chapterIndex + 1).padStart(4, '0');
  const seg = String(segmentIndex + 1).padStart(2, '0');
  const safeTitle = title ? `_${sanitizeFileName(title).slice(0, 40)}` : '';
  return `${ch}_${seg}${safeTitle}.${audioExtension(mime)}`;
}

async function resolveAudioBytes(
  book: Book,
  chapter: BookChapter,
  chapterIndex: number,
  segmentIndex: number,
  audioUrl: string,
  legadoHeaders: Record<string, string> | undefined,
  source: Awaited<ReturnType<typeof sourcesDb.getSource>>,
  onlyCached: boolean,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  const disk = await readAudioFromDisk(
    book.bookUrl,
    chapterIndex,
    segmentIndex,
    audioUrl,
    sourceId,
  );
  if (disk) return { bytes: disk.bytes, mime: disk.meta.mime };

  if (onlyCached) return null;

  const resolved = await fetchAudioBlobSrc(
    { url: audioUrl, headers: legadoHeaders },
    { source: source ?? undefined, chapter, book },
  );
  if (!resolved) return null;
  try {
    const res = await fetch(resolved.src);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const mime =
      (typeof res.headers.get === 'function' ? res.headers.get('content-type') : null)
        ?.split(';')[0]
        ?.trim() || 'audio/mpeg';
    await writeAudioToDisk(
      {
        bookUrl: book.bookUrl,
        chapterIndex,
        segmentIndex,
        audioUrl,
        sourceId: sourceId ?? '',
        mime,
      },
      bytes,
      mime,
    );
    return { bytes, mime };
  } finally {
    resolved.revoke?.();
  }
}

export async function collectAudioForExport(
  book: Book,
  options?: ExportChapterAudioOptions,
): Promise<Map<string, { bytes: ArrayBuffer; mime: string }>> {
  if (isLocalBook(book)) {
    throw new Error('本地书暂不支持导出听书音频');
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
  const targetFormat = options?.targetFormat ?? 'original';
  const files = new Map<string, { bytes: ArrayBuffer; mime: string }>();
  const convertCaps = await resolveMediaConvertCapabilities();
  const shouldTranscode =
    targetFormat !== 'original' && convertCaps.audio.available;

  let totalTracks = 0;
  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim()) continue;
    totalTracks += parseParsedAudioUrls(raw).filter((p) => p?.url).length;
  }
  totalTracks = Math.max(1, totalTracks);
  let processed = 0;

  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim()) continue;

    const parsed = parseParsedAudioUrls(raw);
    for (let segmentIndex = 0; segmentIndex < parsed.length; segmentIndex++) {
      const item = parsed[segmentIndex];
      processed += 1;
      options?.onProgress?.({
        phase: '收集音频',
        current: processed,
        total: totalTracks,
      });
      if (!item?.url) continue;
      const data = await resolveAudioBytes(
        book,
        ch,
        i,
        segmentIndex,
        item.url,
        item.headers,
        source,
        onlyCached,
      );
      if (!data) continue;
      const payload = shouldTranscode
        ? await convertAudioForExport(
            data.bytes,
            data.mime,
            targetFormat,
            convertCaps,
          )
        : { bytes: data.bytes, mime: data.mime };
      const name = chapterAudioFileName(
        i,
        segmentIndex,
        payload.mime,
        ch.title,
      );
      files.set(name, payload);
    }
  }

  if (options?.mergeSingle) {
    return mergeAudioFiles(files, book.name);
  }
  return files;
}

async function saveZipArchive(
  book: Book,
  files: Map<string, { bytes: ArrayBuffer; mime: string }>,
): Promise<void> {
  if (files.size === 0) {
    throw new Error('没有可导出的听书音频（请先缓存章节或阅读生成音频缓存）');
  }

  const zipEntries: Record<string, Uint8Array> = {
    'README.txt': strToU8(`《${book.name}》听书音频导出\n共 ${files.size} 个文件\n`),
  };
  for (const [name, { bytes }] of files) {
    zipEntries[name] = new Uint8Array(bytes);
  }
  const zipped = zipSync(zipEntries);
  const fileName = `${sanitizeFileName(book.name)}_audio.zip`;

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
    if (!path) throw new ExportChapterAudioCancelledError();
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
    throw new Error('没有可导出的听书音频（请先缓存章节或阅读生成音频缓存）');
  }

  if (isTauri()) {
    const silentDir = await resolveSilentExportDirectory('reading');
    const basePath = silentDir ?? formatStorageRef((await pickDirectory()).ref);
    if (!basePath) throw new ExportChapterAudioCancelledError();
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

export async function exportChapterAudio(
  book: Book,
  options?: ExportChapterAudioOptions,
): Promise<{ exported: number }> {
  const format = options?.format ?? 'zip';
  const files = await collectAudioForExport(book, options);
  options?.onProgress?.({
    phase: '写入文件',
    current: 0,
    total: 1,
  });

  if (options?.mergeSingle && files.size === 1 && format === 'zip' && !isTauri()) {
    const entry = [...files.entries()][0];
    if (entry) {
      await saveBinaryFile(entry[0], new Uint8Array(entry[1].bytes), undefined, { moduleKey: 'reading' });
      options?.onProgress?.({ phase: '完成', current: 1, total: 1 });
      return { exported: 1 };
    }
  }

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

export async function warmAudioForCachedChapter(
  book: Book,
  chapterIndex: number,
  raw: string,
  chapter?: BookChapter,
): Promise<WarmAudioChapterResult> {
  const parsed = parseParsedAudioUrls(raw);
  if (parsed.length === 0) {
    return { totalTracks: 0, cachedTracks: 0, complete: true };
  }

  const source = await sourcesDb.getSource(book.origin);
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  let cachedTracks = 0;

  for (let segmentIndex = 0; segmentIndex < parsed.length; segmentIndex++) {
    const item = parsed[segmentIndex];
    if (!item?.url) continue;
    const disk = await readAudioFromDisk(
      book.bookUrl,
      chapterIndex,
      segmentIndex,
      item.url,
      sourceId,
    );
    if (disk) {
      cachedTracks += 1;
      continue;
    }
    const resolved = await fetchAudioBlobSrc(
      { url: item.url, headers: item.headers },
      { source: source ?? undefined, chapter, book },
    );
    if (!resolved) continue;
    try {
      const res = await fetch(resolved.src);
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength < 128) continue;
      const mime =
        res.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
      await writeAudioToDisk(
        {
          bookUrl: book.bookUrl,
          chapterIndex,
          segmentIndex,
          audioUrl: item.url,
          sourceId: sourceId ?? '',
          mime,
        },
        bytes,
        mime,
      );
      cachedTracks += 1;
    } finally {
      resolved.revoke?.();
    }
  }

  return {
    totalTracks: parsed.length,
    cachedTracks,
    complete: cachedTracks >= parsed.length,
  };
}

export async function isAudioChapterTracksCompleteOnDisk(
  book: Book,
  raw: string,
  chapterIndex: number,
): Promise<boolean> {
  const parsed = parseParsedAudioUrls(raw);
  if (parsed.length === 0) return true;
  const source = await sourcesDb.getSource(book.origin);
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  let onDisk = 0;
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item?.url) continue;
    if (await readAudioFromDisk(book.bookUrl, chapterIndex, i, item.url, sourceId)) {
      onDisk += 1;
    }
  }
  return onDisk >= parsed.length;
}

export async function getExportableAudioTrackCount(book: Book): Promise<number> {
  const records = await listAudioRecordsForBook(book.bookUrl);
  return records.length;
}

export function isExportCancelledError(e: unknown): boolean {
  return (
    e instanceof ExportChapterAudioCancelledError ||
    e instanceof FsUserCancelledError ||
    isUserCancelled(e)
  );
}
