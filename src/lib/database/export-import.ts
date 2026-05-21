/**
 * 数据库导出/导入功能
 * 用于在 Tauri 和 Web 环境之间迁移数据
 * 
 * 功能：
 * 1. 导出数据库为文件（ArrayBuffer/Blob）
 * 2. 从文件导入数据库
 * 3. 支持 Tauri 和 Web 两种环境
 */

import { join } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { getDatabase, closeDatabase, initDatabase } from '@/lib/database/database-core';
import { isTauri } from '@/lib/platform/detect';
import type { DatabaseAdapter } from '@/lib/platform/database';

/**
 * 导出数据库为 ArrayBuffer
 * 
 * @returns 数据库文件的 ArrayBuffer
 */
export async function exportDatabase(): Promise<ArrayBuffer> {
  const db = await getDatabase();

  // 检查是否是 Web 环境（sql.js）
  if (isTauri()) {
    // Tauri 环境：从文件系统读取数据库文件
    return await exportTauriDatabase();
  } else {
    // Web 环境：从 sql.js 导出
    return await exportWebDatabase(db);
  }
}

/**
 * 导出 Tauri 环境的数据库
 */
async function exportTauriDatabase(): Promise<ArrayBuffer> {
  try {
    const dataDir = await getAppDataDir();
    const dbPath = await join(dataDir, 'reader.db');

    const data = await readFile(dbPath);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return buf instanceof ArrayBuffer ? buf : new Uint8Array(data).buffer;
  } catch (error) {
    console.error('[数据库导出] Tauri 环境导出失败:', error);
    throw new Error('导出数据库失败: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * 导出 Web 环境的数据库（sql.js）
 */
async function exportWebDatabase(db: DatabaseAdapter): Promise<ArrayBuffer> {
  try {
    // WebDatabaseAdapter 内部有 db 属性
    const adapter = db as any;
    const webDb = adapter.db as import('sql.js').Database | undefined;

    if (!webDb || typeof webDb.export !== 'function') {
      throw new Error('无法获取 sql.js 数据库实例');
    }

    // 导出为 Uint8Array
    const data = webDb.export();
    const buf = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    return buf instanceof ArrayBuffer ? buf : new Uint8Array(data).buffer;
  } catch (error) {
    console.error('[数据库导出] Web 环境导出失败:', error);
    throw new Error('导出数据库失败: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * 导出数据库为 Blob（用于下载）
 * 
 * @param filename 文件名（可选）
 * @returns Blob 对象
 */
export async function exportDatabaseAsBlob(_filename?: string): Promise<Blob> {
  const buffer = await exportDatabase();
  return new Blob([buffer], { type: 'application/x-sqlite3' });
}

/**
 * 导出数据库并触发下载（Web 环境）
 * 
 * @param filename 文件名，默认为 'reader.db'
 */
export async function exportDatabaseAndDownload(filename: string = 'reader.db'): Promise<void> {
  try {
    const blob = await exportDatabaseAsBlob(filename);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    console.log('[数据库导出] 数据库已导出:', filename);
  } catch (error) {
    console.error('[数据库导出] 下载失败:', error);
    throw error;
  }
}

/**
 * 从 ArrayBuffer 导入数据库
 * 
 * @param buffer 数据库文件的 ArrayBuffer
 * @param replace 是否替换现有数据库（默认 false，追加数据）
 */
export async function importDatabase(
  buffer: ArrayBuffer,
  replace: boolean = false
): Promise<void> {
  try {
    if (isTauri()) {
      // Tauri 环境：写入文件系统
      await importTauriDatabase(buffer, replace);
    } else {
      // Web 环境：导入到 sql.js
      await importWebDatabase(buffer, replace);
    }

    console.log('[数据库导入] 数据库导入成功');
  } catch (error) {
    console.error('[数据库导入] 导入失败:', error);
    throw new Error('导入数据库失败: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * 导入 Tauri 环境的数据库
 */
async function importTauriDatabase(
  buffer: ArrayBuffer,
  replace: boolean
): Promise<void> {
  try {
    const dataDir = await getAppDataDir();
    const dbPath = await join(dataDir, 'reader.db');

    // 如果替换，直接写入
    if (replace) {
      await writeFile(dbPath, new Uint8Array(buffer));
      // 重新初始化数据库
      await closeDatabase();
      await initDatabase();
    } else {
      // 追加模式：需要合并数据（复杂，暂时不支持）
      throw new Error('Tauri 环境暂不支持追加模式导入，请使用替换模式');
    }
  } catch (error) {
    console.error('[数据库导入] Tauri 环境导入失败:', error);
    throw error;
  }
}

/**
 * 导入 Web 环境的数据库（sql.js）
 */
async function importWebDatabase(
  buffer: ArrayBuffer,
  replace: boolean
): Promise<void> {
  try {
    // 关闭当前数据库连接
    await closeDatabase();

    // 初始化 sql.js
    const initSqlJsModule = await import('sql.js');
    const initSqlJs = initSqlJsModule.default;
    const SQL = await initSqlJs({
      // 使用与 database.ts 相同的 locateFile 策略
      locateFile: (file: string) => {
        // 优先使用本地文件
        return `/sql.js/${file}`;
      },
    });

    // 从 buffer 加载数据库
    const uint8Array = new Uint8Array(buffer);
    const importedDb = new (SQL as any).Database(uint8Array);

    if (replace) {
      // 替换模式：直接替换 IndexedDB 中的数据
      const indexedDBName = 'reader-db';
      const dbName = 'reader.db';

      // 保存到 IndexedDB
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(indexedDBName, 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['databases'], 'readwrite');
          const store = transaction.objectStore('databases');
          const putRequest = store.put(buffer, dbName);

          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases');
          }
        };
      });

      // 重新初始化数据库
      await initDatabase();
    } else {
      // 追加模式：合并数据（需要实现数据合并逻辑）
      throw new Error('Web 环境暂不支持追加模式导入，请使用替换模式');
    }

    importedDb.close();
  } catch (error) {
    console.error('[数据库导入] Web 环境导入失败:', error);
    throw error;
  }
}

/**
 * 从文件选择器导入数据库（Web 环境）
 * 
 * @param replace 是否替换现有数据库
 */
export async function importDatabaseFromFile(replace: boolean = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        await importDatabase(buffer, replace);
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      reject(new Error('用户取消选择文件'));
    };

    input.click();
  });
}

/**
 * 从文件路径导入数据库（Tauri 环境）
 * 
 * @param filePath 数据库文件路径
 * @param replace 是否替换现有数据库
 */
export async function importDatabaseFromPath(
  filePath: string,
  replace: boolean = false
): Promise<void> {
  if (!isTauri()) {
    throw new Error('此功能仅在 Tauri 环境中可用');
  }

  try {
    const data = await readFile(filePath);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await importDatabase(buf instanceof ArrayBuffer ? buf : new Uint8Array(data).buffer, replace);
  } catch (error) {
    console.error('[数据库导入] 从路径导入失败:', error);
    throw error;
  }
}
