/**
 * v1 bootstrap 冒烟：schema-v1.sql 可执行，关键表与 schema 版本就位
 */

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import schemaV1Sql from '@/lib/database/schema-v1.sql?raw';
import {
  BASELINE_SCHEMA_VERSION,
  splitSqlStatements,
} from '@/lib/database/migration-v1';
import {
  SCHEMA_MODULE_IDS,
  SCHEMA_MODULE_TARGET,
  seedSchemaModules,
} from '@/lib/database/core/schema-modules';
import {
  AudioTables,
  DownloadTables,
  ReaderTables,
  SchemaTables,
  ShellTables,
  SubTables,
  VideoTables,
} from '@/lib/database/table-names';
import type { DatabaseAdapter } from '@/lib/platform/database';

function createAdapter(db: DatabaseSync): DatabaseAdapter {
  return {
    async execute(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...(params as never[]));
    },
    async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async close() {
      db.close();
    },
  };
}

describe('migration baseline v1', () => {
  it('applies schema-v1.sql and seeds schema_modules at version 1', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = createAdapter(raw);

    expect(schemaV1Sql.length).toBeGreaterThan(1000);

    for (const stmt of splitSqlStatements(schemaV1Sql)) {
      await db.execute(stmt);
    }
    await seedSchemaModules(db);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )
    `);
    await db.execute('INSERT INTO schema_version (version) VALUES (?)', [
      BASELINE_SCHEMA_VERSION,
    ]);

    const requiredTables = [
      ReaderTables.books,
      ReaderTables.bookSources,
      ReaderTables.rssArticles,
      ReaderTables.readRecord,
      AudioTables.tracks,
      AudioTables.groups,
      VideoTables.tracks,
      VideoTables.sources,
      ShellTables.themePresets,
      SubTables.sources,
      SubTables.entries,
      DownloadTables.tasks,
      SchemaTables.schemaModules,
    ];

    for (const name of requiredTables) {
      const rows = await db.select<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
        [name],
      );
      expect(rows.length, `missing table ${name}`).toBe(1);
    }

    const legacy = await db.select<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('books','rssArticles','readRecord')`,
    );
    expect(legacy).toEqual([]);

    const version = await db.select<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    );
    expect(version[0]?.version).toBe(1);

    for (const module of SCHEMA_MODULE_IDS) {
      const rows = await db.select<{ version: number }>(
        `SELECT version FROM ${SchemaTables.schemaModules} WHERE module = ?`,
        [module],
      );
      expect(rows[0]?.version).toBe(SCHEMA_MODULE_TARGET[module]);
      expect(rows[0]?.version).toBe(1);
    }

    await db.close();
  });
});
