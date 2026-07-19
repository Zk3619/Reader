/**
 * 数据库初始化和管理
 * 对应 legado 项目的 AppDatabase.kt
 *
 * 使用平台适配层，自动选择 Tauri SQL 插件或 Web 方案（sql.js）
 */

import {
  initDatabase as initPlatformDatabase,
  closeDatabase as closePlatformDatabase,
  type DatabaseAdapter,
} from '@/lib/platform/database';
import { DEFAULT_KEYBOARD_ASSISTS } from '@/lib/database/default-keyboard-assists';
import { DEFAULT_TXT_TOC_RULES } from '@/lib/database/default-txt-toc-rules';
import { DEFAULT_DICT_RULES } from '@/lib/database/default-dict-rules';
import { LEGADO_SCHEMA_VERSION } from '@/lib/database/migration-v96';
import { ReaderTables, AudioTables } from '@/lib/database/table-names';
import { tableExists } from '@/lib/database/core/migration-helpers';

let db: DatabaseAdapter | null = null;
let initPromise: Promise<DatabaseAdapter> | null = null;
const readyWaiters: Array<{
  resolve: (db: DatabaseAdapter) => void;
  reject: (error: unknown) => void;
}> = [];

function notifyDatabaseReady(instance: DatabaseAdapter): void {
  const waiters = readyWaiters.splice(0, readyWaiters.length);
  for (const w of waiters) w.resolve(instance);
}

function notifyDatabaseFailed(error: unknown): void {
  const waiters = readyWaiters.splice(0, readyWaiters.length);
  for (const w of waiters) w.reject(error);
}

/**
 * 初始化数据库
 *
 * 使用 Promise 缓存防止重复初始化
 */
export async function initDatabase(): Promise<DatabaseAdapter> {
  if (db) return db;

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const instance = await initPlatformDatabase();
      await instance.execute('PRAGMA busy_timeout = 3000');
      // 显式开启：子表 FK 已指向 reader_*，运行时需校验
      await instance.execute('PRAGMA foreign_keys = ON');
      await runMigrations(instance);
      // 迁移完成后立刻挂上实例：initDefaultData / 主题 / 音频镜像会 getDatabase()，
      // 若此处未赋值会与 initPromise 互相 await 形成死锁。
      db = instance;
      notifyDatabaseReady(instance);
      console.log('[数据库] 迁移完成，写入默认数据…');
      await initDefaultData(instance);
      try {
        console.log('[数据库] 音频 settings 镜像…');
        const { migrateAudioSettingsIntoDb } = await import(
          '@/lib/database/migrate-audio-settings'
        );
        await migrateAudioSettingsIntoDb(instance);
      } catch (error) {
        console.warn('[数据库] 音频 settings 镜像失败:', error);
      }
      console.log('[数据库] 初始化流程结束');
      return db;
    } catch (error) {
      db = null;
      notifyDatabaseFailed(error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/** 数据库是否已完成迁移并可查询（不触发初始化） */
export function isDatabaseReady(): boolean {
  return db != null;
}

/**
 * 等待 App 开屏后的 initDatabase 完成。
 * 不会自行调用 initDatabase，避免影视等模块在开屏期抢跑整库迁移。
 */
export function whenDatabaseReady(): Promise<DatabaseAdapter> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    readyWaiters.push({ resolve, reject });
  });
}

/**
 * 获取数据库实例
 */
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 运行数据库迁移
 */
export async function runMigrations(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  const result = await db.select<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  let currentVersion = result[0]?.version ?? 0;

  const { migrations } = await import('./migrations');

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      const t0 = Date.now();
      console.log(`执行数据库迁移: ${currentVersion} -> ${migration.version}`);
      try {
        await migration.up(db);
      } catch (error) {
        console.error(
          `[数据库迁移] v${migration.version} 失败 (已 ${Date.now() - t0}ms):`,
          error instanceof Error ? error.message : error,
        );
        throw error;
      }
      await db.execute('INSERT INTO schema_version (version) VALUES (?)', [
        migration.version,
      ]);
      console.log(
        `[数据库迁移] v${migration.version} 完成 (${Date.now() - t0}ms)`,
      );
      currentVersion = migration.version;
    }
  }

  const { ensureChapterCacheSchema } = await import(
    '@/lib/database/migration-chapter-cache-v97'
  );
  const tCache = Date.now();
  console.log('[数据库] ensureChapterCacheSchema…');
  await ensureChapterCacheSchema(db);
  console.log(`[数据库] ensureChapterCacheSchema 完成 (${Date.now() - tCache}ms)`);
}

/**
 * 导入 legado.db 等整库替换后：关闭连接并重新初始化（幂等迁移 + 默认数据）
 */
export async function reinitializeDatabaseAfterImport(): Promise<DatabaseAdapter> {
  await closeDatabase();
  return initDatabase();
}

/**
 * 若已对齐 Legado schema 但 schema_version 未记录，补写目标版本（幂等）
 */
export async function ensureLegadoSchemaVersionRecord(
  db: DatabaseAdapter,
): Promise<void> {
  const rows = await db.select<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  const current = rows[0]?.version ?? 0;
  if (current >= LEGADO_SCHEMA_VERSION) return;

  const bookSourcesTable = (await tableExists(db, ReaderTables.bookSources))
    ? ReaderTables.bookSources
    : 'book_sources';
  const booksTable = (await tableExists(db, ReaderTables.books))
    ? ReaderTables.books
    : 'books';
  const tocTable = (await tableExists(db, ReaderTables.txtTocRules))
    ? ReaderTables.txtTocRules
    : 'txtTocRules';

  const legadoTables = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name IN (?, ?, ?)`,
    [booksTable, bookSourcesTable, tocTable],
  );
  if (legadoTables.length < 3) return;

  const { migrateToLegadoV96 } = await import('@/lib/database/migration-v96');
  await migrateToLegadoV96(db);
  if (current < 1) {
    await db.execute('INSERT INTO schema_version (version) VALUES (?)', [1]);
  }
  await db.execute('INSERT INTO schema_version (version) VALUES (?)', [
    LEGADO_SCHEMA_VERSION,
  ]);
}

/**
 * 初始化默认数据
 */
async function initDefaultData(db: DatabaseAdapter): Promise<void> {
  const hasReaderGroups = await tableExists(db, ReaderTables.bookGroups);
  const hasAudioGroups = await tableExists(db, AudioTables.groups);

  if (hasReaderGroups) {
    await db.execute(`
      INSERT INTO ${ReaderTables.bookGroups}(groupId, groupName, "order", enableRefresh, show, bookSort)
      SELECT -1, '全部', -10, 1, 1, -1
      WHERE NOT EXISTS (SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = -1)
    `);
    await db.execute(`
      INSERT INTO ${ReaderTables.bookGroups}(groupId, groupName, "order", enableRefresh, show, bookSort)
      SELECT -2, '本地', -9, 0, 1, -1
      WHERE NOT EXISTS (SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = -2)
    `);
    await db.execute(`
      INSERT INTO ${ReaderTables.bookGroups}(groupId, groupName, "order", enableRefresh, show, bookSort)
      SELECT -4, '网络未分组', -7, 1, 1, -1
      WHERE NOT EXISTS (SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = -4)
    `);
    await db.execute(`
      INSERT INTO ${ReaderTables.bookGroups}(groupId, groupName, "order", enableRefresh, show, bookSort)
      SELECT -5, '本地未分组', -6, 1, 1, -1
      WHERE NOT EXISTS (SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = -5)
    `);
    await db.execute(`
      INSERT INTO ${ReaderTables.bookGroups}(groupId, groupName, "order", enableRefresh, show, bookSort)
      SELECT -11, '更新失败', -1, 1, 1, -1
      WHERE NOT EXISTS (SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = -11)
    `);
  }

  if (hasAudioGroups) {
    await db.execute(`
      INSERT INTO ${AudioTables.groups}(groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
      SELECT -20, '播放列表', -5, 0, 1, -1, 'default', 'builtin'
      WHERE NOT EXISTS (SELECT * FROM ${AudioTables.groups} WHERE groupId = -20)
    `);
    await db.execute(`
      INSERT INTO ${AudioTables.groups}(groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
      SELECT -23, '试听列表', -4, 0, 1, -1, 'trial', 'builtin'
      WHERE NOT EXISTS (SELECT * FROM ${AudioTables.groups} WHERE groupId = -23)
    `);
    await db.execute(`
      INSERT INTO ${AudioTables.groups}(groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
      SELECT -21, '最近播放', -3, 0, 1, -1, 'recent', 'builtin'
      WHERE NOT EXISTS (SELECT * FROM ${AudioTables.groups} WHERE groupId = -21)
    `);
    await db.execute(`
      INSERT INTO ${AudioTables.groups}(groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
      SELECT -22, '本地音乐', -2, 0, 1, -1, 'local', 'builtin'
      WHERE NOT EXISTS (SELECT * FROM ${AudioTables.groups} WHERE groupId = -22)
    `);
  }

  const bookSourcesTable = (await tableExists(db, ReaderTables.bookSources))
    ? ReaderTables.bookSources
    : 'book_sources';
  const rssSourcesTable = (await tableExists(db, ReaderTables.rssSources))
    ? ReaderTables.rssSources
    : 'rssSources';
  const httpTtsTable = (await tableExists(db, ReaderTables.httpTts))
    ? ReaderTables.httpTts
    : 'httpTTS';
  const keyboardTable = (await tableExists(db, ReaderTables.keyboardAssists))
    ? ReaderTables.keyboardAssists
    : 'keyboardAssists';
  const txtTocTable = (await tableExists(db, ReaderTables.txtTocRules))
    ? ReaderTables.txtTocRules
    : 'txtTocRules';
  const dictTable = (await tableExists(db, ReaderTables.dictRules))
    ? ReaderTables.dictRules
    : 'dictRules';

  await db.execute(`
    UPDATE ${bookSourcesTable} SET loginUi = NULL WHERE loginUi = 'null'
  `);
  await db.execute(`
    UPDATE ${rssSourcesTable} SET loginUi = NULL WHERE loginUi = 'null'
  `);
  await db.execute(`
    UPDATE ${httpTtsTable} SET loginUi = NULL WHERE loginUi = 'null'
  `);
  await db.execute(`
    UPDATE ${httpTtsTable} SET concurrentRate = '0' WHERE concurrentRate IS NULL
  `);

  const keyboardRows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${keyboardTable}`,
  );
  if ((keyboardRows[0]?.count ?? 0) === 0) {
    for (const assist of DEFAULT_KEYBOARD_ASSISTS) {
      await db.execute(
        `INSERT OR REPLACE INTO ${keyboardTable} (type, key, value, serialNo)
         VALUES (?, ?, ?, ?)`,
        [assist.type, assist.key, assist.value, assist.serialNo],
      );
    }
  }

  const txtTocRows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${txtTocTable}`,
  );
  if ((txtTocRows[0]?.count ?? 0) === 0) {
    for (const rule of DEFAULT_TXT_TOC_RULES) {
      await db.execute(
        `INSERT OR REPLACE INTO ${txtTocTable} (id, name, rule, replacement, example, serialNumber, enable)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          rule.id,
          rule.name,
          rule.rule,
          rule.replacement,
          rule.example ?? null,
          rule.serialNumber,
          rule.enable ? 1 : 0,
        ],
      );
    }
  }

  const dictRows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${dictTable}`,
  );
  if ((dictRows[0]?.count ?? 0) === 0) {
    for (const rule of DEFAULT_DICT_RULES) {
      await db.execute(
        `INSERT OR REPLACE INTO ${dictTable} (name, urlRule, showRule, enabled, sortNumber)
         VALUES (?, ?, ?, ?, ?)`,
        [rule.name, rule.urlRule, rule.showRule, rule.enabled ? 1 : 0, rule.sortNumber],
      );
    }
  }

  const { ensureBuiltinThemePresets, ensureDefaultThemePresetActive } = await import(
    '@/lib/database/theme-presets'
  );
  console.log('[数据库] ensureBuiltinThemePresets…');
  await ensureBuiltinThemePresets();
  await ensureDefaultThemePresetActive();
  console.log('[数据库] 默认数据写入完成');
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    await closePlatformDatabase();
    db = null;
  }
}
