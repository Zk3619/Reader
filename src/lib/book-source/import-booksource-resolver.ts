import type { NewBookSource } from '@/types';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  extractSourceUrlsEnvelope,
  parseBookSourceJson,
} from '@/lib/book-source/source-import';
import { filterBlocklistedBookSources } from '@/lib/book-source/source-blocklist';
import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import {
  mergeBookSourceForImport,
  type ImportBookSourceOptions,
} from '@/lib/book-source/import-booksource-merge';
import { isBookSourceImportFileName } from '@/lib/book-source/book-source-import-files';
import {
  DatabaseRestoreRequiredError,
  resolveLegadoArchiveFromFile,
} from '@/lib/book-source/import-legado-archive';
import * as sourcesDb from '@/lib/database/sources';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { syncBooksOriginNameForSource } from '@/lib/bookshelf/sync-book-origin-name';
import { seedBookSourceArgsFromHeader } from '@/lib/book-source/source-variables';
import type { BookSourceImportProgressCallback } from '@/lib/book-source/import-progress';

export type { ImportBookSourceOptions } from '@/lib/book-source/import-booksource-merge';
export {
  buildImportComparisons,
  defaultImportSelection,
  type ImportSourceComparison,
} from '@/lib/book-source/import-booksource-compare';
export { DatabaseRestoreRequiredError } from '@/lib/book-source/import-legado-archive';

export interface ResolvedBookSources {
  sources: NewBookSource[];
  /** ZIP 等包内已自动导入的 RSS / 替换规则等摘要 */
  sideImportSummary?: string[];
}

export interface ImportBookSourcesResult {
  inserted: number;
  blocked: Array<{ sourceName: string; sourceUrl: string }>;
}

export async function resolveBookSourcesFromNetworkUrl(
  urlRaw: string,
  onProgress?: BookSourceImportProgressCallback,
): Promise<ResolvedBookSources> {
  const url = urlRaw.trim();
  if (!url) return { sources: [] };

  onProgress?.({ stage: 'fetch', message: '正在下载书源…' });
  const text = await fetchBookSourceJsonText(url);

  onProgress?.({ stage: 'parse', message: '正在解析书源…' });
  const direct = parseBookSourceJson(text);
  if (direct.length > 0) {
    return { sources: direct };
  }

  const nestedUrls = extractSourceUrlsEnvelope(text);
  if (nestedUrls.length > 0) {
    const total = nestedUrls.length;
    let completed = 0;
    onProgress?.({
      stage: 'fetch',
      message: `正在下载子链接… (0/${total})`,
      current: 0,
      total,
    });

    const nestedResults = await Promise.all(
      nestedUrls.map(async (nestedUrl) => {
        const sub = await resolveBookSourcesFromNetworkUrl(nestedUrl);
        completed += 1;
        onProgress?.({
          stage: 'fetch',
          message: `正在下载子链接… (${completed}/${total})`,
          current: completed,
          total,
        });
        return sub.sources;
      }),
    );

    return { sources: nestedResults.flat() };
  }

  return { sources: [] };
}

export async function resolveBookSourcesFromFile(file: File): Promise<ResolvedBookSources> {
  const archive = await resolveLegadoArchiveFromFile(file);
  if (archive instanceof DatabaseRestoreRequiredError) {
    throw archive;
  }
  return {
    sources: archive.bookSources,
    sideImportSummary:
      archive.sideImportSummary.length > 0 ? archive.sideImportSummary : undefined,
  };
}

/** 目录批量：合并多文件书源，附带项去重；仅含 .db 时抛出 DatabaseRestoreRequiredError */
export async function resolveBookSourcesFromLocalFiles(
  files: File[],
  onProgress?: BookSourceImportProgressCallback,
): Promise<ResolvedBookSources> {
  const eligible = files.filter((f) => isBookSourceImportFileName(f.name));
  if (eligible.length === 0) {
    throw new Error('未找到符合条件的书源文件（json / txt / db）');
  }

  const byUrl = new Map<string, NewBookSource>();
  const sideSet = new Set<string>();
  const dbFiles: File[] = [];
  const fileErrors: string[] = [];
  const total = eligible.length;

  for (let i = 0; i < eligible.length; i++) {
    const file = eligible[i]!;
    onProgress?.({
      stage: 'file',
      message: `正在解析文件… (${i + 1}/${total})`,
      current: i + 1,
      total,
    });
    try {
      const archive = await resolveLegadoArchiveFromFile(file);
      if (archive instanceof DatabaseRestoreRequiredError) {
        dbFiles.push(archive.file);
        continue;
      }
      for (const s of archive.bookSources) {
        byUrl.set(s.sourceUrl, s);
      }
      for (const line of archive.sideImportSummary) {
        sideSet.add(line);
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes('已导入')) {
        sideSet.add(`${file.name}：${msg}`);
      } else {
        fileErrors.push(`${file.name}：${msg}`);
      }
    }
  }

  if (byUrl.size === 0 && dbFiles.length > 0) {
    throw new DatabaseRestoreRequiredError(dbFiles[0]!);
  }

  if (byUrl.size === 0) {
    const detail =
      fileErrors.length > 0 ? fileErrors.slice(0, 3).join('；') : '未能解析出有效书源';
    throw new Error(detail);
  }

  if (dbFiles.length > 0) {
    sideSet.add(
      `已跳过 ${dbFiles.length} 个数据库备份文件，请单独选择 .db 恢复`
    );
  }

  return {
    sources: [...byUrl.values()],
    sideImportSummary: sideSet.size > 0 ? [...sideSet] : undefined,
  };
}

export async function resolveBookSourcesFromText(
  text: string,
  onProgress?: BookSourceImportProgressCallback,
): Promise<ResolvedBookSources> {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return resolveBookSourcesFromNetworkUrl(trimmed, onProgress);
  }
  onProgress?.({ stage: 'parse', message: '正在解析书源…' });
  return { sources: parseBookSourceJson(text) };
}

export async function importSelectedBookSources(
  sources: NewBookSource[],
  options: ImportBookSourceOptions = {}
): Promise<ImportBookSourcesResult> {
  const { allowed, blocked } = await filterBlocklistedBookSources(sources);

  for (const b of blocked) {
    showAppToast({
      title: '禁止导入',
      description: `${b.sourceName} 命中导入黑名单，已跳过`,
      variant: 'default',
    });
  }

  let inserted = 0;
  let syncedOriginNames = false;
  for (const incoming of allowed) {
    const existing = await sourcesDb.getSource(incoming.sourceUrl);
    const merged = mergeBookSourceForImport(incoming, existing, options);
    await sourcesDb.insertSource(merged);
    seedBookSourceArgsFromHeader(merged);
    inserted += 1;
    if (
      existing &&
      !options.keepName &&
      merged.sourceName.trim() !== existing.sourceName.trim()
    ) {
      await syncBooksOriginNameForSource(merged.sourceUrl, merged.sourceName);
      syncedOriginNames = true;
    }
  }

  if (inserted > 0) {
    await sourcesDb.adjustBookSourceSortNumbers();
    invalidateReplaceRulesCache();
    window.dispatchEvent(new CustomEvent('sources-refresh'));
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
    if (syncedOriginNames) {
      window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
    }
  }

  return {
    inserted,
    blocked: blocked.map((b) => ({ sourceName: b.sourceName, sourceUrl: b.sourceUrl })),
  };
}
