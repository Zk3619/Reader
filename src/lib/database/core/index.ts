/** 核心：连接、迁移、表名、Legado 映射 */
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  runMigrations,
  reinitializeDatabaseAfterImport,
  ensureLegadoSchemaVersionRecord,
} from '@/lib/database/database-core';
export { DATABASE_NAME, INDEXED_DB_NAME } from '@/lib/database/database-name';
export * from '@/lib/database/table-names';
export * from '@/lib/database/core/schema-modules';
export * from '@/lib/database/core/legado-table-map';
export * from '@/lib/database/core/migration-helpers';
