/**
 * 数据库迁移 v117 — video_configs → video_sources（配置包源引擎，对齐 audio_sources）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  dropTableIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { VideoTables } from '@/lib/database/table-names';

export const VIDEO_SOURCES_SCHEMA_VERSION = 117;

function inferKind(url: string): string {
  const u = (url || '').trim().toLowerCase();
  if (!u || u.startsWith('pasted:') || u === 'pasted') return 'paste';
  if (u.startsWith('file:') || u.startsWith('/') || /^[a-z]:[\\/]/i.test(u)) return 'local';
  if (u.startsWith('http://') || u.startsWith('https://')) return 'url';
  return 'local';
}

export async function migrateVideoSourcesV117(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.sources} (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'url',
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      script TEXT,
      script_url TEXT,
      version TEXT,
      custom_order INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_video_sources_script_url
    ON ${VideoTables.sources}(script_url)
    WHERE script_url IS NOT NULL AND script_url != ''
  `);

  const already = await db.select<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ${VideoTables.sources}`,
  );
  if ((already[0]?.c ?? 0) > 0) {
    await dropLegacyConfigTables(db);
    await setSchemaModuleVersion(db, 'video', 5);
    return;
  }

  const fromTable = (await tableExists(db, 'video_configs'))
    ? 'video_configs'
    : (await tableExists(db, 'tv_config'))
      ? 'tv_config'
      : null;

  if (fromTable) {
    const rows = await db.select<{
      id: number;
      url: string;
      name: string;
      type: number;
      json: string;
      updated_at: number;
    }>(
      `SELECT id, url, name, type, json, updated_at FROM "${fromTable}" ORDER BY updated_at ASC`,
    );

    // 同 url 只保留最新
    const byUrl = new Map<string, (typeof rows)[0]>();
    const noUrl: typeof rows = [];
    for (const row of rows) {
      const url = (row.url || '').trim();
      if (!url) {
        noUrl.push(row);
        continue;
      }
      const prev = byUrl.get(url);
      if (!prev || row.updated_at >= prev.updated_at) byUrl.set(url, row);
    }
    const ordered = [...byUrl.values(), ...noUrl].sort(
      (a, b) => a.updated_at - b.updated_at,
    );

    let order = 0;
    for (const row of ordered) {
      const url = (row.url || '').trim();
      const scriptUrl = url || null;
      const meta = JSON.stringify({ type: Number(row.type) || 0 });
      await db.execute(
        `INSERT OR IGNORE INTO ${VideoTables.sources}
          (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          String(row.id),
          inferKind(url),
          row.name || url || `source-${row.id}`,
          row.json ?? '',
          scriptUrl,
          order++,
          meta,
          row.updated_at || Date.now(),
          row.updated_at || Date.now(),
        ],
      );
    }
  }

  await dropLegacyConfigTables(db);
  await setSchemaModuleVersion(db, 'video', 5);
}

async function dropLegacyConfigTables(db: DatabaseAdapter): Promise<void> {
  await dropTableIfExists(db, 'video_configs');
  await dropTableIfExists(db, 'tv_config');
}
