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
import { LEGADO_SCHEMA_VERSION } from '@/lib/database/migration-v96';

let db: DatabaseAdapter | null = null;
let initPromise: Promise<DatabaseAdapter> | null = null;

/**
 * 初始化数据库
 * 
 * 使用 Promise 缓存防止重复初始化
 */
export async function initDatabase(): Promise<DatabaseAdapter> {
  // 如果已经初始化，直接返回
  if (db) return db;

  // 如果正在初始化，返回同一个 Promise（防止并发调用）
  if (initPromise) {
    return initPromise;
  }

  // 开始初始化，创建 Promise
  initPromise = (async () => {
    try {
      // 使用平台适配层初始化数据库
      db = await initPlatformDatabase();

      // 运行迁移
      await runMigrations(db);

      // 初始化默认数据
      await initDefaultData(db);

      return db;
    } finally {
      // 初始化完成，清空 Promise（但保留 db）
      initPromise = null;
    }
  })();

  return initPromise;
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
  // 创建版本表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  // 获取当前版本
  const result = await db.select<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  const currentVersion = result[0]?.version ?? 0;

  // 导入迁移
  const { migrations } = await import('./migrations');

  // 执行迁移
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`执行数据库迁移: ${currentVersion} -> ${migration.version}`);
      await migration.up(db);
      await db.execute(
        'INSERT INTO schema_version (version) VALUES (?)',
        [migration.version]
      );
    }
  }
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
  db: DatabaseAdapter
): Promise<void> {
  const rows = await db.select<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  const current = rows[0]?.version ?? 0;
  if (current >= LEGADO_SCHEMA_VERSION) return;

  const legadoTables = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name IN ('books', 'book_sources', 'txtTocRules')`
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
 * 对应 legado 项目的 AppDatabase.dbCallback.onOpen
 */
async function initDefaultData(db: DatabaseAdapter): Promise<void> {
  // 初始化默认分组（如果不存在）
  // 全部
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -1, '全部', -10, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -1)
  `);

  // 本地（enableRefresh=0 与 Legado 一致）
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -2, '本地', -9, 0, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -2)
  `);

  // 音频
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -3, '音频', -8, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -3)
  `);

  // 网络未分组
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -4, '网络未分组', -7, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -4)
  `);

  // 本地未分组
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -5, '本地未分组', -6, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -5)
  `);

  // 视频
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -6, '视频', -5, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -6)
  `);

  // 更新失败
  await db.execute(`
    INSERT INTO book_groups(groupId, groupName, "order", enableRefresh, show, bookSort) 
    SELECT -11, '更新失败', -1, 1, 1, -1
    WHERE NOT EXISTS (SELECT * FROM book_groups WHERE groupId = -11)
  `);

  // 数据修复：清理null字符串
  await db.execute(`
    UPDATE book_sources SET loginUi = NULL WHERE loginUi = 'null'
  `);

  await db.execute(`
    UPDATE rssSources SET loginUi = NULL WHERE loginUi = 'null'
  `);

  await db.execute(`
    UPDATE httpTTS SET loginUi = NULL WHERE loginUi = 'null'
  `);

  await db.execute(`
    UPDATE httpTTS SET concurrentRate = '0' WHERE concurrentRate IS NULL
  `);

  const keyboardRows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM keyboardAssists'
  );
  if ((keyboardRows[0]?.count ?? 0) === 0) {
    for (const assist of DEFAULT_KEYBOARD_ASSISTS) {
      await db.execute(
        `INSERT OR REPLACE INTO keyboardAssists (type, key, value, serialNo)
         VALUES (?, ?, ?, ?)`,
        [assist.type, assist.key, assist.value, assist.serialNo]
      );
    }
  }
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
