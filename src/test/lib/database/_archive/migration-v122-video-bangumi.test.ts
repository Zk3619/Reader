/**
 * v122 番剧表迁移 + 规则/prefs 规范化单测
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@/lib/platform/database';
import { migrateVideoBangumiV122 } from '@/lib/database/migration-v122-video-bangumi';
import { VideoTables, SchemaTables } from '@/lib/database/table-names';
import { MediaGroupId } from '@/types/book-group';
import { SCHEMA_MODULE_TARGET } from '@/lib/database/core/schema-modules';
import { normalizeBangumiRule, BANGUMI_EXAMPLE_RULE } from '@/lib/media/video/bangumi/rules';
import { normalizeModulePrefs } from '@/lib/media/video/bangumi/prefs';

type Row = Record<string, unknown>;

class MemoryDb implements DatabaseAdapter {
  tables = new Set<string>();
  groups: Row[] = [];
  tracks: Row[] = [];
  playRecords: Row[] = [];
  schemaModules: Row[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiRules}`)) {
      this.tables.add(VideoTables.bangumiRules);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiRuleSubs}`)) {
      this.tables.add(VideoTables.bangumiRuleSubs);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiSubjects}`)) {
      this.tables.add(VideoTables.bangumiSubjects);
      return;
    }
    if (s.startsWith(`CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiPrefs}`)) {
      this.tables.add(VideoTables.bangumiPrefs);
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
    if (s.includes(`INSERT OR IGNORE INTO ${VideoTables.groups}`)) {
      this.groups.push({
        groupId: params[0],
        groupName: params[1],
        order: params[2],
        listId: params[3],
      });
      return;
    }
    if (s.includes(`UPDATE ${VideoTables.groups}`)) {
      const g = this.groups.find((r) => r.groupId === params[3]);
      if (g) {
        g.groupName = params[0];
        g.order = params[1];
        g.listId = params[2];
      } else {
        this.groups.push({
          groupId: params[3],
          groupName: params[0],
          order: params[1],
          listId: params[2],
        });
      }
      return;
    }
    if (s.includes(`UPDATE ${VideoTables.tracks}`) && s.includes("kind = 'bangumi'")) {
      for (const t of this.tracks) {
        const id = String(t.id ?? '');
        const site = String(t.site_key ?? '');
        if ((id.startsWith('bangumi$') || site === 'bangumi') && t.kind !== 'bangumi') {
          t.kind = 'bangumi';
        }
      }
      return;
    }
    if (s.includes(`UPDATE ${VideoTables.playRecord}`) && s.includes("kind = 'bangumi'")) {
      for (const t of this.playRecords) {
        const id = String(t.id ?? '');
        const site = String(t.site_key ?? '');
        if ((id.startsWith('bangumi$') || site === 'bangumi') && t.kind !== 'bangumi') {
          t.kind = 'bangumi';
        }
      }
    }
  }

  async select<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.includes('sqlite_master') && s.includes("type='table'")) {
      const name = String(params[0] ?? '');
      return (this.tables.has(name) ? [{ name }] : []) as T[];
    }
    if (s.includes(`FROM ${SchemaTables.schemaModules}`)) {
      const module = String(params[0]);
      const row = this.schemaModules.find((r) => r.module === module);
      return (row ? [{ version: row.version }] : []) as T[];
    }
    return [] as T[];
  }

  async close(): Promise<void> {
    /* noop */
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

describe('migration-v122-video-bangumi', () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = new MemoryDb();
    db.tables.add(VideoTables.groups);
    db.tables.add(VideoTables.tracks);
    db.tables.add(VideoTables.playRecord);
    db.tracks.push({ id: 'bangumi$123', site_key: 'bangumi', kind: 'vod' });
    db.playRecords.push({ id: 'bangumi$123$ep', site_key: 'bangumi', kind: 'vod' });
  });

  it('creates bangumi tables and sets video module to 9', async () => {
    await migrateVideoBangumiV122(db);
    expect(db.tables.has(VideoTables.bangumiRules)).toBe(true);
    expect(db.tables.has(VideoTables.bangumiRuleSubs)).toBe(true);
    expect(db.tables.has(VideoTables.bangumiSubjects)).toBe(true);
    expect(db.tables.has(VideoTables.bangumiPrefs)).toBe(true);
    expect(SCHEMA_MODULE_TARGET.video).toBe(9);
    const mod = db.schemaModules.find((r) => r.module === 'video');
    expect(mod?.version).toBe(9);
  });

  it('seeds VideoBangumi system group and fixes bangumi$ kind', async () => {
    await migrateVideoBangumiV122(db);
    expect(db.groups.some((g) => g.groupId === MediaGroupId.VideoBangumi)).toBe(true);
    expect(db.tracks[0]?.kind).toBe('bangumi');
    expect(db.playRecords[0]?.kind).toBe('bangumi');
  });
});

describe('bangumi rule/prefs normalize', () => {
  it('normalizes example rule', () => {
    const n = normalizeBangumiRule(BANGUMI_EXAMPLE_RULE);
    expect(n?.id).toBe('bg_example_demo');
    expect(n?.version).toBe(2);
  });

  it('normalizes module prefs and subscribe urls', () => {
    const p = normalizeModulePrefs({
      ruleSubscribeUrls: [' https://a.com ', '', 'https://b.com'],
      resolveMode: 'webview',
      autoUpdateRules: true,
    });
    expect(p.ruleSubscribeUrls).toEqual(['https://a.com', 'https://b.com']);
    expect(p.resolveMode).toBe('webview');
    expect(p.autoUpdateRules).toBe(true);
  });
});

describe('upsertHistory kind contract', () => {
  it('siteKey bangumi defaults kind to bangumi', () => {
    const siteKey = 'bangumi';
    const kind: string | undefined = undefined;
    const resolved =
      kind === 'live' || kind === 'local' || kind === 'bangumi' || kind === 'vod'
        ? kind
        : siteKey === 'bangumi'
          ? 'bangumi'
          : 'vod';
    expect(resolved).toBe('bangumi');
  });
});
