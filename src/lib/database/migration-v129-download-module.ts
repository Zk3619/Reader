/**
 * v129: 下载模块任务 / 扩展表（download_tasks、download_extensions），
 * 并从 localStorage 迁入既有数据。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { DownloadTables } from '@/lib/database/table-names';

export const DOWNLOAD_MODULE_SCHEMA_VERSION = 129;

const LEGACY_TASKS_KEY = 'download.gopeed.tasks.v1';
const LEGACY_EXTENSIONS_KEY = 'download.gopeed.extensions.v1';

function readLocalJsonArray(key: string): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function migrateDownloadModuleV129(db: DatabaseAdapter): Promise<void> {
  const tasksTable = DownloadTables.tasks;
  const extTable = DownloadTables.extensions;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${tasksTable} (
      id TEXT PRIMARY KEY NOT NULL,
      engine TEXT NOT NULL DEFAULT 'gopeed',
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'ready',
      percent REAL NOT NULL DEFAULT 0,
      speed INTEGER NOT NULL DEFAULT 0,
      eta INTEGER NOT NULL DEFAULT -1,
      downloaded INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      filepath TEXT NOT NULL DEFAULT '',
      error TEXT,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_download_tasks_state ON ${tasksTable}(state)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_download_tasks_updated ON ${tasksTable}(updated_at DESC)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${extTable} (
      identity TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_download_extensions_updated ON ${extTable}(updated_at DESC)`,
  );

  const existingTasks = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${tasksTable}`,
  );
  if (Number(existingTasks[0]?.c ?? 0) === 0) {
    const legacyTasks = readLocalJsonArray(LEGACY_TASKS_KEY);
    for (const item of legacyTasks) {
      const row = asRecord(item);
      const id = String(row.id ?? '').trim();
      if (!id) continue;
      const meta =
        row.meta && typeof row.meta === 'object' ? JSON.stringify(row.meta) : '{}';
      await db.execute(
        `INSERT OR REPLACE INTO ${tasksTable}
          (id, engine, url, title, state, percent, speed, eta, downloaded, total, filepath, error, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(row.engine ?? 'gopeed'),
          String(row.url ?? ''),
          String(row.title ?? ''),
          String(row.state ?? 'ready'),
          Number(row.percent ?? 0) || 0,
          Math.trunc(Number(row.speed ?? 0) || 0),
          Math.trunc(Number(row.eta ?? -1)),
          Math.trunc(Number(row.downloaded ?? 0) || 0),
          Math.trunc(Number(row.total ?? 0) || 0),
          String(row.filepath ?? ''),
          row.error == null ? null : String(row.error),
          meta,
          Math.trunc(Number(row.createdAt ?? Date.now()) || Date.now()),
          Math.trunc(Number(row.updatedAt ?? Date.now()) || Date.now()),
        ],
      );
    }
    if (legacyTasks.length > 0 && typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_TASKS_KEY);
    }
  }

  const existingExt = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${extTable}`,
  );
  if (Number(existingExt[0]?.c ?? 0) === 0) {
    const legacyExt = readLocalJsonArray(LEGACY_EXTENSIONS_KEY);
    for (const item of legacyExt) {
      const row = asRecord(item);
      const identity = String(row.identity ?? '').trim();
      if (!identity) continue;
      await db.execute(
        `INSERT OR REPLACE INTO ${extTable}
          (identity, payload, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          identity,
          JSON.stringify(row),
          row.disabled ? 1 : 0,
          Math.trunc(Number(row.createdAt ?? Date.now()) || Date.now()),
          Math.trunc(Number(row.updatedAt ?? Date.now()) || Date.now()),
        ],
      );
    }
    if (legacyExt.length > 0 && typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_EXTENSIONS_KEY);
    }
  }

  await setSchemaModuleVersion(db, 'download', 2);
}
