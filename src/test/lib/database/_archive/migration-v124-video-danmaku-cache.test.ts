/**
 * v124 弹幕缓存表迁移单测
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@/lib/platform/database';
import { migrateVideoDanmakuCacheV124 } from '@/lib/database/migration-v124-video-danmaku-cache';
import { VideoTables, SchemaTables } from '@/lib/database/table-names';

type Row = Record<string, unknown>;

class MemoryDb implements DatabaseAdapter {
  tables = new Set<string>();
  schemaModules: Row[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.danmakuCache}`)) {
      this.tables.add(VideoTables.danmakuCache);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.danmakuOverride}`)) {
      this.tables.add(VideoTables.danmakuOverride);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${SchemaTables.schemaModules}`)) {
      this.tables.add(SchemaTables.schemaModules);
      return;
    }
    if (s.startsWith('CREATE INDEX IF NOT EXISTS')) return;
    if (s.includes(`INSERT INTO ${SchemaTables.schemaModules}`)) {
      const module = String(params[0]);
      const version = Number(params[1]);
      const idx = this.schemaModules.findIndex((r) => r.module === module);
      if (idx >= 0) this.schemaModules[idx] = { module, version };
      else this.schemaModules.push({ module, version });
      return;
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

describe('migration-v124-video-danmaku-cache', () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = new MemoryDb();
  });

  it('creates danmaku cache and override tables', async () => {
    await migrateVideoDanmakuCacheV124(db);
    expect(db.tables.has(VideoTables.danmakuCache)).toBe(true);
    expect(db.tables.has(VideoTables.danmakuOverride)).toBe(true);
    const videoMod = db.schemaModules.find((r) => r.module === 'video');
    expect(videoMod?.version).toBe(11);
  });
});
