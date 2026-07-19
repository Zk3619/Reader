/**
 * 数据库平台适配层
 * 支持 Tauri SQL 插件和 Web 环境（sql.js + IndexedDB）
 * 
 * 自动检测运行环境：
 * - Tauri环境：使用 @tauri-apps/plugin-sql
 * - Web环境：使用 sql.js (WASM) + IndexedDB 持久化
 * 
 * 对应 legado 项目的数据库功能
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import sqlWasmBundledUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  DATABASE_NAME,
  INDEXED_DB_NAME,
  LEGACY_DATABASE_NAMES,
  LEGACY_INDEXED_DB_KEY,
  LEGACY_INDEXED_DB_NAME,
} from '@/lib/database/database-name';

export { DATABASE_NAME, INDEXED_DB_NAME };

/**
 * 检测是否可以使用 Tauri SQL 插件（带缓存）
 * 
 * 先检查环境，再尝试导入插件
 * 使用动态 import 避免在 Web 环境下静态导入导致错误
 */
let canUseTauriCache: boolean | null = null;
let canUseTauriPromise: Promise<boolean> | null = null;

async function canUseTauriSql(): Promise<boolean> {
  // 如果已经检测过，直接返回缓存结果
  if (canUseTauriCache !== null) {
    return canUseTauriCache;
  }

  // 如果正在检测，返回同一个 Promise（防止并发调用）
  if (canUseTauriPromise) {
    return canUseTauriPromise;
  }

  // 开始检测
  canUseTauriPromise = (async () => {
    try {
      // 首先检查是否在 Tauri 环境
      const inTauri = isTauri();

      // 只在第一次检测时输出日志
      if (canUseTauriCache === null) {
        const win = window as Window & { __TAURI__?: unknown };
        const g = globalThis as typeof globalThis & { isTauri?: boolean };
        console.log('[数据库适配层] 环境检测:', {
          isTauri: inTauri,
          hasWindow: typeof window !== 'undefined',
          globalIsTauri: g.isTauri === true,
          hasTauriObject: typeof window !== 'undefined' && typeof win.__TAURI__ !== 'undefined',
          tauriEnvPlatform: import.meta.env.TAURI_ENV_PLATFORM ?? null,
        });
      }

      if (!inTauri) {
        console.log('[数据库适配层] ⚠️ 不在 Tauri 环境，跳过 SQL 插件检测');
        canUseTauriCache = false;
        return false;
      }

      try {
        // 在 Tauri 环境中，尝试动态导入 Tauri SQL 插件
        // 使用动态 import 避免在 Web 环境下静态导入导致构建/运行时错误
        await import('@tauri-apps/plugin-sql');
        console.log('[数据库适配层] ✅ 检测到 Tauri SQL 插件可用');
        canUseTauriCache = true;
        return true;
      } catch (error) {
        console.log('[数据库适配层] ⚠️ Tauri SQL 插件导入失败:', error instanceof Error ? error.message : String(error));
        canUseTauriCache = false;
        return false;
      }
    } finally {
      // 检测完成，清空 Promise（但保留缓存）
      canUseTauriPromise = null;
    }
  })();

  return canUseTauriPromise;
}

/**
 * 数据库接口抽象
 * 统一 Tauri SQL 插件和 sql.js 的接口
 */
export interface DatabaseAdapter {
  /**
   * 执行 SQL 语句（不返回结果）
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * 查询 SQL 语句（返回结果）
   */
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * 关闭数据库连接
   */
  close(): Promise<void>;
}

/**
 * Tauri 环境数据库实现（使用 @tauri-apps/plugin-sql）
 */
class TauriDatabaseAdapter implements DatabaseAdapter {
  private db: Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql').default.load>>;

  constructor(db: Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql').default.load>>) {
    this.db = db;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.db.execute(sql, params || []);
  }

  async select<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    // Tauri SQL 插件的 select 方法返回 Promise<T[]>
    // 使用类型断言确保类型匹配
    const result = await (this.db.select as <T>(sql: string, params?: unknown[]) => Promise<T[]>)(sql, params || []);
    return result as T[];
  }

  async close(): Promise<void> {
    // Tauri SQL Plugin 会自动管理连接
    // 这里可以清空引用
  }
}

/**
 * Web 环境数据库实现（使用 sql.js + IndexedDB）
 */
export class WebDatabaseAdapter implements DatabaseAdapter {
  public db: import('sql.js').Database;
  private dbName: string;
  private indexedDBName: string;

  constructor(
    db: import('sql.js').Database,
    dbName: string,
    indexedDBName: string = INDEXED_DB_NAME
  ) {
    this.db = db;
    this.dbName = dbName;
    this.indexedDBName = indexedDBName;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    try {
      if (params && params.length > 0) {
        // sql.js 使用参数化查询
        const stmt = this.db.prepare(sql);
        try {
          // sql.js 使用数组形式绑定参数（对应 ? 占位符）
          // 类型转换：unknown[] -> SqlValue[]
          stmt.bind(params as import('sql.js').SqlValue[]);
          stmt.step();
        } finally {
          stmt.free();
        }
      } else {
        // 无参数直接执行
        this.db.run(sql);
      }

      // 执行后自动保存到 IndexedDB
      await this.saveToIndexedDB();
    } catch (error) {
      console.error('执行 SQL 失败:', sql, error);
      throw error;
    }
  }

  async select<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      try {
        if (params && params.length > 0) {
          // sql.js 使用数组形式绑定参数（对应 ? 占位符）
          // 类型转换：unknown[] -> SqlValue[]
          stmt.bind(params as import('sql.js').SqlValue[]);
        }

        const results: T[] = [];
        while (stmt.step()) {
          const row = stmt.getAsObject() as T;
          results.push(row);
        }
        return results;
      } finally {
        stmt.free();
      }
    } catch (error) {
      console.error('查询 SQL 失败:', sql, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // 保存到 IndexedDB 后关闭
    await this.saveToIndexedDB();
    this.db.close();
  }

  /**
   * 保存数据库到 IndexedDB
   */
  private async saveToIndexedDB(): Promise<void> {
    try {
      const data = this.db.export();
      // 将 Uint8Array 转换为 ArrayBuffer（IndexedDB 需要）
      const buffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );

      return new Promise<void>((resolve) => {
        const request = indexedDB.open(this.indexedDBName, 1);

        request.onerror = () => {
          console.warn('IndexedDB 打开失败，数据库更改未持久化:', request.error);
          resolve(); // 不阻塞执行，仅警告
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['databases'], 'readwrite');
          const store = transaction.objectStore('databases');
          const putRequest = store.put(buffer, this.dbName);

          putRequest.onerror = () => {
            console.warn('保存数据库到 IndexedDB 失败:', putRequest.error);
            resolve(); // 不阻塞执行，仅警告
          };
          putRequest.onsuccess = () => resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases');
          }
        };
      });
    } catch (error) {
      console.error('保存数据库到 IndexedDB 失败:', error);
      // 不抛出错误，允许继续运行
    }
  }

  /**
   * 从 IndexedDB 加载数据库
   */
  static async loadFromIndexedDB(
    SQL: import('sql.js').SqlJsStatic,
    dbName: string,
    indexedDBName: string = INDEXED_DB_NAME
  ): Promise<import('sql.js').Database | null> {
    try {
      return new Promise<import('sql.js').Database | null>((resolve) => {
        const request = indexedDB.open(indexedDBName, 1);

        request.onerror = () => {
          // IndexedDB 不存在或无法打开，返回 null 创建新数据库
          resolve(null);
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['databases'], 'readonly');
          const store = transaction.objectStore('databases');
          const getRequest = store.get(dbName);

          getRequest.onerror = () => {
            // 获取失败，返回 null 创建新数据库
            resolve(null);
          };

          getRequest.onsuccess = () => {
            const buffer = getRequest.result;
            if (buffer) {
              try {
                // 将 ArrayBuffer 转换为 Uint8Array
                const uint8Array = buffer instanceof ArrayBuffer
                  ? new Uint8Array(buffer)
                  : new Uint8Array(buffer as ArrayBuffer);
                // SQL 是 SqlJsStatic 类型，包含 Database 构造函数
                const database = new (SQL as any).Database(uint8Array);
                resolve(database);
              } catch (error) {
                console.error('从 IndexedDB 加载数据库失败:', error);
                resolve(null);
              }
            } else {
              resolve(null);
            }
          };
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases');
          }
        };
      });
    } catch (error) {
      console.error('从 IndexedDB 加载数据库失败:', error);
      return null;
    }
  }
}

/**
 * 数据库实例缓存
 */
let dbAdapter: DatabaseAdapter | null = null;
let initPromise: Promise<DatabaseAdapter> | null = null;

/**
 * 若仅有旧库文件，则 rename 为 mediabox.db（含 -wal/-shm）
 */
async function migrateLegacyDbFileIfNeeded(baseDir: string): Promise<void> {
  const { exists, rename } = await import('@tauri-apps/plugin-fs');
  const target = await join(baseDir, DATABASE_NAME);
  if (await exists(target)) return;

  for (const legacyName of LEGACY_DATABASE_NAMES) {
    const legacyPath = await join(baseDir, legacyName);
    if (!(await exists(legacyPath))) continue;
    console.log(`[数据库适配层] 迁移旧库 ${legacyName} → ${DATABASE_NAME}`);
    await rename(legacyPath, target);
    for (const suffix of ['-wal', '-shm']) {
      const legacySide = `${legacyPath}${suffix}`;
      const targetSide = `${target}${suffix}`;
      if (await exists(legacySide)) {
        try {
          await rename(legacySide, targetSide);
        } catch (error) {
          console.warn('[数据库适配层] 旁路文件迁移失败:', legacySide, error);
        }
      }
    }
    return;
  }
}

/**
 * 初始化 Tauri 环境数据库
 */
async function initTauriDatabase(): Promise<DatabaseAdapter> {
  try {
    const isFirstInit = !dbAdapter;
    if (isFirstInit) {
      console.log('[数据库适配层] 开始初始化 Tauri SQL 插件...');
    }

    const baseDir = await getAppDataDir();
    await migrateLegacyDbFileIfNeeded(baseDir);
    const dbPath = await join(baseDir, DATABASE_NAME);

    const { default: Database } = await import('@tauri-apps/plugin-sql');

    if (isFirstInit) {
      console.log('[数据库适配层] Tauri SQL 插件导入成功');
      console.log('[数据库适配层] 加载数据库文件:', dbPath);
    }

    const db = await Database.load(`sqlite:${dbPath}`);

    if (isFirstInit) {
      console.log('[数据库适配层] Tauri SQL 数据库加载成功');
    }

    return new TauriDatabaseAdapter(db);
  } catch (error) {
    console.error('[数据库适配层] Tauri 数据库初始化失败:', error);
    console.error('[数据库适配层] 错误详情:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // 抛出错误，让调用者决定是否降级
    throw error;
  }
}

const SQLJS_WASM_VERSION = '1.14.0';

function sqlJsWasmBaseLocal(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}sql.js/`;
}

function sqlJsWasmBaseCdn(): string {
  return `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_WASM_VERSION}/dist/`;
}

async function initSqlJsWithLocate(
  locateFile: (file: string) => string
): Promise<import('sql.js').SqlJsStatic> {
  const initSqlJsModule = await import('sql.js');
  const initSqlJs = initSqlJsModule.default;
  return initSqlJs({ locateFile });
}

async function initSqlJsWithWasmBase(locateBase: string): Promise<import('sql.js').SqlJsStatic> {
  const base = locateBase.endsWith('/') ? locateBase : `${locateBase}/`;
  return initSqlJsWithLocate((file) => `${base}${file}`);
}

/**
 * 初始化 Web 环境数据库
 */
async function initWebDatabase(): Promise<DatabaseAdapter> {
  try {
    console.log('[数据库适配层] 开始初始化 Web 方案（sql.js）...');

    let SQL: import('sql.js').SqlJsStatic | undefined;
    const loaders: Array<{ label: string; run: () => Promise<import('sql.js').SqlJsStatic> }> = [
      {
        label: 'Vite 资源',
        run: () => initSqlJsWithLocate(() => sqlWasmBundledUrl),
      },
      {
        label: 'public/sql.js',
        run: () => initSqlJsWithWasmBase(sqlJsWasmBaseLocal()),
      },
      {
        label: 'jsDelivr CDN',
        run: () => initSqlJsWithWasmBase(sqlJsWasmBaseCdn()),
      },
    ];

    let lastError: unknown;
    for (const { label, run } of loaders) {
      try {
        SQL = await run();
        console.log(`[数据库适配层] sql.js WASM 初始化成功（${label}）`);
        break;
      } catch (error) {
        lastError = error;
        console.warn(`[数据库适配层] ${label} WASM 加载失败:`, error);
      }
    }
    if (SQL === undefined) {
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError ?? 'sql.js WASM 加载失败'));
    }

    // 尝试从 IndexedDB 加载现有数据库（优先 mediabox，回退旧 reader.db）
    console.log('[数据库适配层] 尝试从 IndexedDB 加载数据库...');
    let database = await WebDatabaseAdapter.loadFromIndexedDB(
      SQL,
      DATABASE_NAME,
      INDEXED_DB_NAME
    );

    if (!database) {
      database = await WebDatabaseAdapter.loadFromIndexedDB(
        SQL,
        LEGACY_INDEXED_DB_KEY,
        LEGACY_INDEXED_DB_NAME
      );
      if (database) {
        console.log('[数据库适配层] 从旧 IndexedDB 键加载，将写入 mediabox');
      }
    }

    // 如果不存在，创建新数据库
    if (!database) {
      console.log('[数据库适配层] IndexedDB 中不存在数据库，创建新数据库');
      database = new (SQL as any).Database();
    } else {
      console.log('[数据库适配层] 从 IndexedDB 成功加载数据库');
    }

    // database 此时肯定不是 null
    return new WebDatabaseAdapter(database!, DATABASE_NAME, INDEXED_DB_NAME);
  } catch (error) {
    console.error('[数据库适配层] Web 数据库初始化失败:', error);
    throw new Error('数据库初始化失败: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * 初始化数据库（自动选择 Tauri 或 Web 方案）
 * 
 * 策略：
 * 1. 首先尝试使用 Tauri SQL 插件（如果可用）
 * 2. 如果失败，自动降级到 Web 方案（sql.js）
 * 
 * 使用 Promise 缓存防止重复初始化
 */
export async function initDatabase(): Promise<DatabaseAdapter> {
  // 如果已经初始化，直接返回
  if (dbAdapter) {
    return dbAdapter;
  }

  // 如果正在初始化，返回同一个 Promise（防止并发调用）
  if (initPromise) {
    return initPromise;
  }

  // 开始初始化，创建 Promise
  initPromise = (async () => {
    try {
      // 检测是否可以使用 Tauri SQL 插件
      const canUseTauri = await canUseTauriSql();

      if (canUseTauri) {
        try {
          dbAdapter = await initTauriDatabase();
          console.log('[数据库适配层] ✅ 使用 Tauri SQL 插件初始化数据库');
          return dbAdapter;
        } catch (error) {
          console.warn('[数据库适配层] ⚠️ Tauri SQL 插件初始化失败，降级到 Web 方案:', error);
          // 降级到 Web 方案
          dbAdapter = await initWebDatabase();
          console.log('[数据库适配层] ✅ 使用 Web 方案（sql.js）初始化数据库');
          return dbAdapter;
        }
      } else {
        // 直接使用 Web 方案
        dbAdapter = await initWebDatabase();
        console.log('[数据库适配层] ✅ 使用 Web 方案（sql.js）初始化数据库');
        return dbAdapter;
      }
    } finally {
      // 初始化完成，清空 Promise（但保留 dbAdapter）
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * 获取数据库实例
 */
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (!dbAdapter) {
    return await initDatabase();
  }
  return dbAdapter;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (dbAdapter) {
    await dbAdapter.close();
    dbAdapter = null;
  }
}

// DatabaseAdapter 接口已在上面导出，无需重复导出
