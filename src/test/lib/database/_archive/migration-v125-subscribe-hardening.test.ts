/**
 * v125 订阅模块索引加固迁移单测
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@/lib/platform/database';
import { migrateSubscribeHardeningV125 } from '@/lib/database/migration-v125-subscribe-hardening';
import { SubTables, SchemaTables } from '@/lib/database/table-names';

type Row = Record<string, unknown>;

class MemoryDb implements DatabaseAdapter {
  indexes: string[] = [];
  schemaModules: Row[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.startsWith('CREATE UNIQUE INDEX') || s.startsWith('CREATE INDEX')) {
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

describe('migration-v125-subscribe-hardening', () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = new MemoryDb();
  });

  it('creates sub_* indexes and bumps subscribe module version', async () => {
    await migrateSubscribeHardeningV125(db);
    expect(db.indexes.length).toBeGreaterThanOrEqual(5);
    expect(db.indexes.some((s) => s.includes(SubTables.sources))).toBe(true);
    expect(db.indexes.some((s) => s.includes(SubTables.feeds))).toBe(true);
    expect(db.indexes.some((s) => s.includes(SubTables.entries))).toBe(true);
    const subMod = db.schemaModules.find((r) => r.module === 'subscribe');
    expect(subMod?.version).toBe(3);
  });
});
