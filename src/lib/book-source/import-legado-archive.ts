/**
 * Legado 备份包 / 多类型 JSON 导入编排
 */

import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import {
  importReplaceRulesFromJson,
  parseReplaceRuleJson,
} from '@/lib/book-source/import-replace-rule';
import { importRssSourcesFromList } from '@/lib/book-source/import-rss-batch';
import {
  extractLegadoZipEntries,
  pickZipEntry,
  LEGADO_ZIP_BOOK_SOURCE_NAMES,
  LEGADO_ZIP_RSS_NAMES,
  LEGADO_ZIP_REPLACE_RULE_NAMES,
} from '@/lib/book-source/legado-zip';
import type { NewBookSource } from '@/types';

export class DatabaseRestoreRequiredError extends Error {
  readonly kind = 'databaseRestore' as const;
  constructor(public readonly file: File) {
    super('需要恢复数据库备份');
    this.name = 'DatabaseRestoreRequiredError';
  }
}

export interface LegadoArchiveImportPreview {
  bookSources: NewBookSource[];
  sideImportSummary: string[];
}

export async function resolveLegadoArchiveFromFile(
  file: File
): Promise<LegadoArchiveImportPreview | DatabaseRestoreRequiredError> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3')) {
    return new DatabaseRestoreRequiredError(file);
  }

  if (lower.endsWith('.zip')) {
    const entries = await extractLegadoZipEntries(file);
    const bookJson = pickZipEntry(entries, [
      ...LEGADO_ZIP_BOOK_SOURCE_NAMES,
      'booksource.json',
    ]);
    const rssJson = pickZipEntry(entries, LEGADO_ZIP_RSS_NAMES);
    const replaceJson = pickZipEntry(entries, LEGADO_ZIP_REPLACE_RULE_NAMES);

    const sideImportSummary: string[] = [];
    if (rssJson) {
      const rss = parseRssSourceJson(rssJson);
      if (rss.length > 0) {
        const n = await importRssSourcesFromList(rss);
        sideImportSummary.push(`RSS 源 ${n} 条`);
      }
    }
    if (replaceJson) {
      const n = await importReplaceRulesFromJson(replaceJson);
      if (n > 0) sideImportSummary.push(`替换规则 ${n} 条`);
    }

    const bookSources = bookJson ? parseBookSourceJson(bookJson) : [];
    if (bookSources.length === 0 && sideImportSummary.length === 0) {
      throw new Error('ZIP 中未找到可识别的书源或配置 JSON');
    }
    return { bookSources, sideImportSummary };
  }

  const text = await file.text();
  if (!text.trim()) {
    throw new Error('文件内容为空');
  }

  const bookSources = parseBookSourceJson(text);
  if (bookSources.length > 0) {
    return { bookSources, sideImportSummary: [] };
  }

  const rss = parseRssSourceJson(text);
  if (rss.length > 0) {
    const n = await importRssSourcesFromList(rss);
    throw new Error(`已导入 RSS 源 ${n} 条（非书源 JSON）`);
  }

  const replaceRules = parseReplaceRuleJson(text);
  if (replaceRules.length > 0) {
    const n = await importReplaceRulesFromJson(text);
    throw new Error(`已导入替换规则 ${n} 条（非书源 JSON）`);
  }

  throw new Error('未能识别文件内容，请确认是 legado 书源 JSON 或备份 ZIP');
}
