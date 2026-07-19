/**
 * Legado 无前缀表名 ↔ MediaBox reader_* 映射（导入/导出适配器）
 */

import { ReaderTables } from '@/lib/database/table-names';
import { READER_TABLE_RENAMES } from '@/lib/database/migration-v112-reader-prefix';

/** Legado 原名 → reader_* */
export const LEGADO_TO_READER: Record<string, string> = Object.fromEntries(
  READER_TABLE_RENAMES.map(({ from, to }) => [from, to]),
);

/** 另含 book_groups → reader_book_groups（分组在 M2 已拆，不再经 media_groups） */
LEGADO_TO_READER.book_groups = ReaderTables.bookGroups;

/** reader_* → Legado 原名 */
export const READER_TO_LEGADO: Record<string, string> = Object.fromEntries(
  Object.entries(LEGADO_TO_READER).map(([legado, reader]) => [reader, legado]),
);

export function mapLegadoTableToReader(table: string): string | null {
  return LEGADO_TO_READER[table] ?? null;
}

export function mapReaderTableToLegado(table: string): string | null {
  return READER_TO_LEGADO[table] ?? null;
}

/** 导入时可复制的共有表（不含 audio/video/shell/sub） */
export const LEGADO_IMPORTABLE_TABLES: string[] = [
  ...READER_TABLE_RENAMES.map((r) => r.from),
  'book_groups',
];

/**
 * 生成导入 SQL 提示：从源库表 upsert 到目标 reader_* 表。
 * 实际拷贝由 backup/import 流程执行；此处仅提供映射契约。
 */
export function resolveImportTarget(legadoTable: string): string | null {
  return mapLegadoTableToReader(legadoTable);
}

export function resolveExportSource(legadoTable: string): string | null {
  return mapLegadoTableToReader(legadoTable);
}
