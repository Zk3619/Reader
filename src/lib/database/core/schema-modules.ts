/**
 * 分模块 schema 版本（M1）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { SchemaTables } from '@/lib/database/table-names';

export const SCHEMA_MODULE_IDS = [
  'core',
  'shell',
  'reader',
  'audio',
  'video',
  'subscribe',
  'download',
] as const;

export type SchemaModuleId = (typeof SCHEMA_MODULE_IDS)[number];

/** 各模块当前目标版本（与全局 schema_version 迁移步进对齐；v115 = 6） */
export const SCHEMA_MODULE_TARGET: Record<SchemaModuleId, number> = {
  core: 6,
  shell: 4,
  reader: 6,
  audio: 8,
  video: 11,
  subscribe: 6,
  download: 2,
};

export async function ensureSchemaModulesTable(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SchemaTables.schemaModules} (
      module TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    )
  `);
}

export async function seedSchemaModules(
  db: DatabaseAdapter,
  versions: Partial<Record<SchemaModuleId, number>> = SCHEMA_MODULE_TARGET,
): Promise<void> {
  await ensureSchemaModulesTable(db);
  for (const module of SCHEMA_MODULE_IDS) {
    const version = versions[module] ?? 0;
    await db.execute(
      `INSERT INTO ${SchemaTables.schemaModules} (module, version) VALUES (?, ?)
       ON CONFLICT(module) DO UPDATE SET version = excluded.version`,
      [module, version],
    );
  }
}

export async function setSchemaModuleVersion(
  db: DatabaseAdapter,
  module: SchemaModuleId,
  version: number,
): Promise<void> {
  await ensureSchemaModulesTable(db);
  await db.execute(
    `INSERT INTO ${SchemaTables.schemaModules} (module, version) VALUES (?, ?)
     ON CONFLICT(module) DO UPDATE SET version = excluded.version`,
    [module, version],
  );
}

export async function getSchemaModuleVersion(
  db: DatabaseAdapter,
  module: SchemaModuleId,
): Promise<number> {
  await ensureSchemaModulesTable(db);
  const rows = await db.select<{ version: number }>(
    `SELECT version FROM ${SchemaTables.schemaModules} WHERE module = ?`,
    [module],
  );
  return rows[0]?.version ?? 0;
}
