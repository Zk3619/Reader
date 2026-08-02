/**
 * 数据库迁移 v110 — M1：schema_modules 分模块版本
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { seedSchemaModules } from '@/lib/database/core/schema-modules';

export const SCHEMA_MODULES_SCHEMA_VERSION = 110;

export async function migrateSchemaModulesV110(db: DatabaseAdapter): Promise<void> {
  // 种子写入目标版本；后续 M2–M4 会分别 bump 对应 module
  await seedSchemaModules(db, {
    core: 1,
    shell: 1,
    reader: 1,
    audio: 1,
    video: 1,
    subscribe: 1,
  });
}
