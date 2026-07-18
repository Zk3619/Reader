/**
 * 会话文档后端：getStorage('session.json')
 * Tauri → appData/session.json；Web → localStorage store_session.json_*
 *
 * getSessionDoc 仅用于一次性迁移旧数据；新域请勿以 setSessionDoc 作为权威写入
 *（临时 migrate 写完后应改走 settings.json / SQLite / sessionStorage）。
 */

import { getStorage, setStorage, deleteStorage } from '@/lib/platform/storage';

const SESSION_FILE = 'session.json';

/** @deprecated 迁移专用：读取旧 session.json 文档 */
export async function getSessionDoc<T>(key: string): Promise<T | null> {
  return getStorage<T>(key, SESSION_FILE);
}

/**
 * @deprecated 迁移专用：勿将新业务数据写入 session.json。
 * 跨重启偏好 → settings.json（getStorage 默认）；实体/进度 → SQLite；进程内临时 → sessionStorage。
 */
export async function setSessionDoc<T>(key: string, value: T): Promise<void> {
  await setStorage(key, value, SESSION_FILE);
}

/** @deprecated 迁移清理用 */
export async function removeSessionDoc(key: string): Promise<void> {
  await deleteStorage(key, SESSION_FILE);
}
