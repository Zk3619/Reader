/**
 * Legado 备份包 / 多类型 JSON 导入编排
 */

import {
  classifyLegadoImportJson,
  matchesLegadoImportKind,
  wrongLegadoImportKindMessage,
  type LegadoImportItemKind,
} from '@/lib/book-source/legado-import-kind';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
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

function assertBookSourceArchive(text: string, fileLabel: string): void {
  const { dominant, counts, items } = classifyLegadoImportJson(text);
  if (
    dominant === 'bookSource' ||
    dominant === 'sourceUrlsEnvelope' ||
    (dominant === 'unknown' &&
      items.length > 0 &&
      items.every((item) => matchesLegadoImportKind(item, 'bookSource')))
  ) {
    return;
  }

  const actual =
    dominant === 'unknown'
      ? ((Object.entries(counts).find(([, n]) => (n ?? 0) > 0)?.[0] as LegadoImportItemKind | undefined) ??
        'unknown')
      : dominant;

  throw new Error(
    `${fileLabel}：${wrongLegadoImportKindMessage('bookSource', actual)}`,
  );
}

export async function resolveLegadoArchiveFromFile(
  file: File,
): Promise<LegadoArchiveImportPreview | DatabaseRestoreRequiredError> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3')) {
    return new DatabaseRestoreRequiredError(file);
  }

  if (lower.endsWith('.zip')) {
    throw new Error(
      'ZIP 备份包请前往「设置 → 存储与缓存 → 数据备份」恢复，本地书源导入仅支持 JSON / TXT',
    );
  }

  const text = await file.text();
  if (!text.trim()) {
    throw new Error('文件内容为空');
  }

  assertBookSourceArchive(text, file.name);

  const bookSources = parseBookSourceJson(text);
  if (bookSources.length > 0) {
    return { bookSources, sideImportSummary: [] };
  }

  throw new Error(`${file.name}：未能识别为有效的书源 JSON，请确认文件内容`);
}
