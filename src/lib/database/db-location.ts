/**
 * 数据库文件位置工具
 * 用于查找和显示数据库文件的实际存储位置
 */

import { join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-shell';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import {
  DATABASE_NAME,
  INDEXED_DB_NAME,
  LEGACY_INDEXED_DB_KEY,
  LEGACY_INDEXED_DB_NAME,
} from '@/lib/database/database-name';

/**
 * 获取数据库文件的实际存储路径
 *
 * @returns 数据库文件路径（Tauri）或存储位置描述（Web）
 */
export async function getDatabaseLocation(): Promise<string> {
  if (isTauri()) {
    try {
      const dataDir = await getAppDataDir();
      return await join(dataDir, DATABASE_NAME);
    } catch (error) {
      console.error('[数据库位置] 获取 Tauri 数据目录失败:', error);
      return '无法获取数据目录';
    }
  } else {
    return 'IndexedDB (浏览器本地存储)';
  }
}

/**
 * Web 环境检查数据库是否存在（IndexedDB）
 */
async function checkWebDatabaseExists(): Promise<boolean> {
  const tryKey = (dbName: string, key: string): Promise<boolean> =>
    new Promise((resolve) => {
      try {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('databases')) {
            resolve(false);
            return;
          }
          const transaction = db.transaction(['databases'], 'readonly');
          const store = transaction.objectStore('databases');
          const checkRequest = store.get(key);
          checkRequest.onsuccess = () => {
            resolve(checkRequest.result !== undefined);
          };
          checkRequest.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      } catch (error) {
        console.warn('[数据库位置] IndexedDB 检查失败:', error);
        resolve(false);
      }
    });

  if (await tryKey(INDEXED_DB_NAME, DATABASE_NAME)) return true;
  return tryKey(LEGACY_INDEXED_DB_NAME, LEGACY_INDEXED_DB_KEY);
}

/**
 * 检查数据库文件是否存在（仅 Tauri 环境）
 */
export async function checkDatabaseExists(): Promise<boolean> {
  if (!isTauri()) {
    return await checkWebDatabaseExists();
  }

  try {
    const dbPath = await getDatabaseLocation();
    return await exists(dbPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('forbidden path')) {
      console.error('[数据库位置] 无权限访问数据库路径，请检查 FS 作用域:', error);
      return false;
    }
    console.warn('[数据库位置] 检查数据库文件失败，回退到 Web 检查:', error);
    return await checkWebDatabaseExists();
  }
}

/**
 * 打开数据库文件所在目录（仅 Tauri 环境）
 */
export async function openDatabaseDirectory(): Promise<void> {
  if (!isTauri()) {
    throw new Error('此功能仅在 Tauri 环境中可用');
  }

  try {
    const dataDir = await getAppDataDir();
    await open(dataDir);
  } catch (error) {
    console.error('[数据库位置] 打开目录失败:', error);
    throw new Error(
      '无法打开数据库目录: ' + (error instanceof Error ? error.message : String(error)),
    );
  }
}
