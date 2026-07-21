/**
 * 导出书籍正文：TXT / EPUB，单文件或按章拆分
 */

import { join } from '@tauri-apps/api/path';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { zipSync, strToU8 } from 'fflate';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook, readLocalBookContent, getLocalContent } from '@/lib/local-book';
import {
  readCachedChapterRaw,
  fetchAndCacheChapterContent,
} from '@/lib/chapter-cache/storage';
import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';
import { getChapterDisplayTitle } from '@/lib/replace-rules/chapter-display-title';
import { isExportReplaceEnabledForBook, getExportNoChapterName } from '@/lib/replace-rules/export-replace-policy';
import { isReplaceRuleEnabledForBook } from '@/lib/replace-rules/replace-rule-policy';
import { saveTextFile, SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import { saveBinaryFile } from '@/lib/export/save-binary-file';
import { buildEpubArchive } from '@/lib/export/export-epub';
import type { ExportProgressCallback } from '@/lib/export/export-progress';
import type { TextExportFormat, TextExportLayout } from '@/lib/export/cache-export-types';
import { isTauri } from '@/lib/platform/detect';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import {
  rememberExportDirectory,
  resolveSilentExportDirectory,
} from '@/lib/export/export-location';
import type { Book } from '@/types';

export interface ExportBookOptions {
  startIndex?: number;
  endIndex?: number;
  fetchMissing?: boolean;
  onlyCached?: boolean;
  format?: TextExportFormat;
  layout?: TextExportLayout;
  onProgress?: ExportProgressCallback;
}

export type ExportBookChapter = {
  index: number;
  title: string;
  body: string;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';
}

function chapterFileBase(chapter: ExportBookChapter): string {
  const num = String(chapter.index + 1).padStart(4, '0');
  return `${num}_${sanitizeFileName(chapter.title).slice(0, 60)}`;
}

export async function buildBookChaptersForExport(
  book: Book,
  options?: ExportBookOptions,
): Promise<ExportBookChapter[]> {
  const chapters = await chaptersDb.getChapterList(book.bookUrl);
  if (chapters.length === 0) {
    throw new Error('该书暂无章节目录，请先更新目录');
  }

  const start = options?.startIndex ?? 0;
  const end = options?.endIndex ?? chapters.length - 1;
  const fetchMissing = options?.fetchMissing ?? true;
  const onlyCached = options?.onlyCached ?? false;
  const total = Math.max(1, end - start + 1);

  const source = !isLocalBook(book)
    ? await sourcesDb.getSource(book.origin)
    : null;

  const result: ExportBookChapter[] = [];
  let processed = 0;

  const report = () => {
    options?.onProgress?.({
      phase: '读取章节',
      current: processed,
      total,
    });
  };

  const useReplace = isExportReplaceEnabledForBook(isReplaceRuleEnabledForBook(book));
  const exportFormat = options?.format ?? 'txt';
  const exportProcessing = {
    useReplace,
    reSegment: false,
    chineseConvert: false,
    removeDuplicateTitle: true,
    forceRemoveTitle: exportFormat === 'epub',
  };

  if (isLocalBook(book)) {
    const fileContent = await readLocalBookContent(book.bookUrl);
    for (let i = start; i <= end && i < chapters.length; i++) {
      const ch = chapters[i];
      if (!ch) continue;
      const raw = (await getLocalContent(book, ch, fileContent)) ?? '';
      const body = useReplace
        ? await applyChapterDisplayProcessing(raw, book, null, ch, undefined, exportProcessing)
        : raw;
      const title = useReplace
        ? await getChapterDisplayTitle(ch.title, book, book.origin, i)
        : ch.title;
      result.push({ index: i, title, body });
      processed += 1;
      report();
    }
    return result;
  }

  if (!source?.enabled) {
    throw new Error('书源不存在或已禁用');
  }

  for (let i = start; i <= end && i < chapters.length; i++) {
    const ch = chapters[i];
    if (!ch) continue;

    let raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim() && fetchMissing) {
      const next = chapters[i + 1];
      raw = await fetchAndCacheChapterContent(source, book, ch, next?.url, i);
    }
    if (!raw?.trim()) {
      if (onlyCached) {
        processed += 1;
        report();
        continue;
      }
      result.push({
        index: i,
        title: ch.title,
        body: '[本章未缓存且拉取失败]\n',
      });
      processed += 1;
      report();
      continue;
    }

    const body = useReplace
      ? await applyChapterDisplayProcessing(raw, book, source, ch, undefined, exportProcessing)
      : raw;
    const title = useReplace
      ? await getChapterDisplayTitle(ch.title, book, source?.sourceUrl ?? book.origin, i)
      : ch.title;
    result.push({ index: i, title, body: body });
    processed += 1;
    report();
  }

  if (onlyCached && result.length === 0) {
    throw new Error('该书暂无可导出的已缓存章节');
  }
  return result;
}

export async function buildBookTxtContent(
  book: Book,
  options?: ExportBookOptions,
): Promise<string> {
  const chapters = await buildBookChaptersForExport(book, options);
  const includeChapterName = !getExportNoChapterName();
  return chapters
    .map((ch) =>
      includeChapterName ? `\n\n${ch.title}\n\n${ch.body}` : `\n\n${ch.body}`,
    )
    .join('')
    .trimStart();
}

async function saveSplitChapters(
  book: Book,
  chapters: ExportBookChapter[],
  format: TextExportFormat,
  layout: TextExportLayout,
): Promise<void> {
  if (chapters.length === 0) {
    throw new Error('没有可导出的章节');
  }

  const useZip = layout === 'split_zip' || (layout === 'split' && !isTauri());

  if (useZip) {
    const zipEntries: Record<string, Uint8Array> = {
      'README.txt': strToU8(`《${book.name}》按章导出\n共 ${chapters.length} 章\n`),
    };
    for (const ch of chapters) {
      const base = chapterFileBase(ch);
      if (format === 'epub') {
        zipEntries[`${base}.epub`] = buildEpubArchive(
          { title: ch.title, author: book.author },
          [{ id: 'ch1', title: ch.title, html: ch.body }],
        );
      } else {
        zipEntries[`${base}.txt`] = strToU8(
          getExportNoChapterName() ? `${ch.body}` : `${ch.title}\n\n${ch.body}`,
        );
      }
    }
    const zipped = zipSync(zipEntries);
    await saveBinaryFile(`${sanitizeFileName(book.name)}_chapters.zip`, zipped, [
      { name: 'ZIP', extensions: ['zip'] },
    ], { moduleKey: 'reading' });
    return;
  }

  const silentDir = await resolveSilentExportDirectory('reading');
  const basePath = silentDir ?? formatStorageRef((await pickDirectory()).ref);
  if (!basePath) throw new SaveTextFileCancelledError();
  await rememberExportDirectory(basePath);
  const bookDir = await join(basePath, sanitizeFileName(book.name));
  await mkdir(bookDir, { recursive: true });

  for (const ch of chapters) {
    const base = chapterFileBase(ch);
    if (format === 'epub') {
      const bytes = buildEpubArchive(
        { title: ch.title, author: book.author },
        [{ id: 'ch1', title: ch.title, html: ch.body }],
      );
      await writeFile(await join(bookDir, `${base}.epub`), bytes);
    } else {
      await writeFile(
        await join(bookDir, `${base}.txt`),
        strToU8(getExportNoChapterName() ? `${ch.body}` : `${ch.title}\n\n${ch.body}`),
      );
    }
  }
}

async function saveSingleExport(
  book: Book,
  chapters: ExportBookChapter[],
  format: TextExportFormat,
): Promise<void> {
  if (format === 'epub') {
    const bytes = buildEpubArchive(
      { title: book.name, author: book.author },
      chapters.map((ch) => ({
        id: `ch${ch.index + 1}`,
        title: ch.title,
        html: ch.body,
      })),
    );
    await saveBinaryFile(`${sanitizeFileName(book.name)}.epub`, bytes, [
      { name: 'EPUB', extensions: ['epub'] },
    ], { moduleKey: 'reading' });
    return;
  }

  const content = chapters
    .map((ch) =>
      getExportNoChapterName() ? `\n\n${ch.body}` : `\n\n${ch.title}\n\n${ch.body}`,
    )
    .join('')
    .trimStart();
  await saveTextFile(`${sanitizeFileName(book.name)}.txt`, content, { moduleKey: 'reading' });
}

export async function exportBook(
  book: Book,
  options?: ExportBookOptions,
): Promise<{ exported: number }> {
  const format = options?.format ?? 'txt';
  const layout = options?.layout ?? 'single';
  const chapters = await buildBookChaptersForExport(book, options);

  options?.onProgress?.({
    phase: '写入文件',
    current: 0,
    total: 1,
  });

  if (layout === 'single') {
    await saveSingleExport(book, chapters, format);
  } else {
    await saveSplitChapters(book, chapters, format, layout);
  }

  options?.onProgress?.({
    phase: '完成',
    current: 1,
    total: 1,
  });

  return { exported: chapters.length };
}
