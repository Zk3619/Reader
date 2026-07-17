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
      // 并发的播放记录、缓存与列表操作短暂争用写锁时等待，而不是立即失败。
      await db.execute('PRAGMA busy_timeout = 3000');

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
  let currentVersion = result[0]?.version ?? 0;

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
      currentVersion = migration.version;
    }
  }

  // 章节缓存列与版本号解耦，避免「已记录 v97 但缺 file_path」导致读写失败
  const { ensureChapterCacheSchema } = await import(
    '@/lib/database/migration-chapter-cache-v97'
  );
  await ensureChapterCacheSchema(db);
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
  const groupsTable = 'media_groups';

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -1, '全部', -10, 1, 1, -1, 'shelf'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -1)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -2, '本地', -9, 0, 1, -1, 'shelf'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -2)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -4, '网络未分组', -7, 1, 1, -1, 'shelf'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -4)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -5, '本地未分组', -6, 1, 1, -1, 'shelf'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -5)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -11, '更新失败', -1, 1, 1, -1, 'shelf'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -11)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -7, '收藏', -4, 0, 1, -1, 'shared'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -7)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain)
    SELECT -8, '试读/试听/试看', -3, 0, 1, -1, 'shared'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -8)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain, listId, source)
    SELECT -20, '播放列表', -5, 0, 1, -1, 'music', 'default', 'builtin'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -20)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain, listId, source)
    SELECT -23, '试听列表', -4, 0, 1, -1, 'music', 'trial', 'builtin'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -23)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain, listId, source)
    SELECT -21, '最近播放', -3, 0, 1, -1, 'music', 'recent', 'builtin'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -21)
  `);

  await db.execute(`
    INSERT INTO ${groupsTable}(groupId, groupName, "order", enableRefresh, show, bookSort, domain, listId, source)
    SELECT -22, '本地音乐', -2, 0, 1, -1, 'music', 'local', 'builtin'
    WHERE NOT EXISTS (SELECT * FROM ${groupsTable} WHERE groupId = -22)
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

  const txtTocRows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM txtTocRules'
  );
  if ((txtTocRows[0]?.count ?? 0) === 0) {
    for (const rule of DEFAULT_TXT_TOC_RULES) {
      await db.execute(
        `INSERT OR REPLACE INTO txtTocRules (id, name, rule, replacement, example, serialNumber, enable)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          rule.id,
          rule.name,
          rule.rule,
          rule.replacement,
          rule.example ?? null,
          rule.serialNumber,
          rule.enable ? 1 : 0,
        ]
      );
    }
  }

  const dictRows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM dictRules'
  );
  if ((dictRows[0]?.count ?? 0) === 0) {
    for (const rule of DEFAULT_DICT_RULES) {
      await db.execute(
        `INSERT OR REPLACE INTO dictRules (name, urlRule, showRule, enabled, sortNumber)
         VALUES (?, ?, ?, ?, ?)`,
        [rule.name, rule.urlRule, rule.showRule, rule.enabled ? 1 : 0, rule.sortNumber]
      );
    }
  }

  const { ensureBuiltinThemePresets, ensureDefaultThemePresetActive } = await import(
    '@/lib/database/theme-presets'
  );
  await ensureBuiltinThemePresets();
  await ensureDefaultThemePresetActive();
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
