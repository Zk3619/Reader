/**
 * 数据库基线 v1：一次性应用当前产品最终 schema（压扁自原 v1…v129 链）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { seedSchemaModules } from '@/lib/database/core/schema-modules';
import schemaV1Sql from '@/lib/database/schema-v1.sql?raw';

export const BASELINE_SCHEMA_VERSION = 1;

/** 将 bootstrap SQL 拆成单条语句（忽略空行与 `--` 注释行） */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function migrateBaselineV1(db: DatabaseAdapter): Promise<void> {
  const statements = splitSqlStatements(schemaV1Sql);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  await seedSchemaModules(db);
}
