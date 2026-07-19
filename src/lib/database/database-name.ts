/**
 * MediaBox 数据库文件名与 IndexedDB 键（M1）
 * 旧名 reader.db / legado.db 仅作迁移源别名
 */

export const DATABASE_NAME = 'mediabox.db';
/** IndexedDB database name（objectStore 内的 key 仍用 DATABASE_NAME） */
export const INDEXED_DB_NAME = 'mediabox-db';
/** 旧库文件名，启动时若存在则 rename/copy 到 DATABASE_NAME */
export const LEGACY_DATABASE_NAMES = ['reader.db', 'legado.db'] as const;
/** 旧 IndexedDB 库名 */
export const LEGACY_INDEXED_DB_NAME = 'reader-db';
export const LEGACY_INDEXED_DB_KEY = 'reader.db';
