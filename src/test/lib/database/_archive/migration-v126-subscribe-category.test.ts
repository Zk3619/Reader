/**
 * v126 订阅源 category 列迁移单测
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@/lib/platform/database';
import { migrateSubscribeCategoryV126 } from '@/lib/database/migration-v126-subscribe-category';
import { SubTables, SchemaTables } from '@/lib/database/table-names';

type Row = Record<string, unknown>;

class MemoryDb implements DatabaseAdapter {
  tables = new Set<string>([SubTables.sources]);
  columns = new Map<string, Set<string>>([[SubTables.sources, new Set(['id', 'url', 'title'])]]);
  indexes: string[] = [];
  alters: string[] = [];
  schemaModules: Row[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.startsWith('ALTER TABLE')) {
      this.alters.push(s);
      const match = s.match(/ADD COLUMN (\w+)/i);
      if (match?.[1]) {
        const cols = this.columns.get(SubTables.sources) ?? new Set();
        cols.add(match[1]);
        this.columns.set(SubTables.sources, cols);
      }
      return;
    }
    if (s.startsWith('CREATE INDEX') || s.startsWith('CREATE UNIQUE INDEX')) {
      this.indexes.push(s);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${SchemaTables.schemaModules}`)) return;
    if (s.includes(`INSERT INTO ${SchemaTables.schemaModules}`)) {
      const module = String(params[0]);
      const version = Number(params[1]);
      const idx = this.schemaModules.findIndex((r) => r.module === module);
      if (idx >= 0) this.schemaModules[idx] = { module, version };
      else this.schemaModules.push({ module, version });
    }
  }

  async select<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.includes('sqlite_master')) {
      const name = String(params[0] ?? '');
      return (this.tables.has(name) ? [{ name }] : []) as T[];
    }
    if (s.startsWith('PRAGMA table_info')) {
      const table = s.match(/PRAGMA table_info\(([^)]+)\)/)?.[1] ?? '';
      const cols = [...(this.columns.get(table) ?? [])];
      return cols.map((name) => ({ name })) as T[];
    }
    if (s.includes(`FROM ${SchemaTables.schemaModules}`)) {
      if (params[0]) {
        return this.schemaModules.filter((r) => r.module === params[0]) as T[];
      }
      return this.schemaModules as T[];
    }
    return [];
  }

  async close(): Promise<void> {
    /* no-op */
  }
}

describe('migration-v126-subscribe-category', () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = new MemoryDb();
  });

  it('adds category column/index and bumps subscribe module version', async () => {
    await migrateSubscribeCategoryV126(db);
    expect(db.alters.some((s) => s.includes('category'))).toBe(true);
    expect(db.indexes.some((s) => s.includes('idx_sub_sources_category'))).toBe(true);
    const subMod = db.schemaModules.find((r) => r.module === 'subscribe');
    expect(subMod?.version).toBe(4);
  });

  it('is idempotent when category already exists', async () => {
    db.columns.get(SubTables.sources)!.add('category');
    await migrateSubscribeCategoryV126(db);
    expect(db.alters).toHaveLength(0);
    expect(db.indexes.some((s) => s.includes('idx_sub_sources_category'))).toBe(true);
  });
});
