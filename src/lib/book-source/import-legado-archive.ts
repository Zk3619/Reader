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
    throw new Error(
      'ZIP 备份包请前往「设置 → 存储与缓存 → 数据备份」恢复，本地书源导入仅支持 JSON / TXT'
    );
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

  throw new Error('未能识别文件内容，请确认是 legado 书源 JSON');
}
