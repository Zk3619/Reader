/**
 * 数据库模块统一导出
 * 对应 legado 项目的 AppDatabase.kt
 */

// 数据库初始化和管理
export {
  initDatabase,
  getDatabase,
  isDatabaseReady,
  whenDatabaseReady,
  closeDatabase,
  runMigrations,
  reinitializeDatabaseAfterImport,
  isPreSquashLegacyDatabase,
} from '@/lib/database/database-core';

// 书籍相关DAO
export * from '@/lib/database/books';

// 章节相关DAO
export * from '@/lib/database/chapters';

// 书源相关DAO
export * from '@/lib/database/sources';

// 分组相关DAO
export * from '@/lib/database/book-groups';
export * from '@/lib/database/media-groups';

// 书签相关DAO
export * from '@/lib/database/bookmarks';

// 替换规则相关DAO
export * from '@/lib/database/replace-rules';

// 搜索结果相关DAO
export * from '@/lib/database/search-books';

// 搜索关键词相关DAO
export * from '@/lib/database/search-keywords';

// 阅读记录相关DAO
export * from '@/lib/database/read-records';

// RSS源相关DAO
export * from '@/lib/database/rss-sources';

// RSS文章相关DAO
export * from '@/lib/database/rss-articles';

// RSS收藏相关DAO
export * from '@/lib/database/rss-stars';

// RSS阅读记录相关DAO
export * from '@/lib/database/rss-read-records';
export * from '@/lib/database/sub-sources';
export * from '@/lib/database/sub-feeds';
export * from '@/lib/database/sub-entries';
export * from '@/lib/database/subscribe';

// 章节缓存相关DAO
export * from '@/lib/database/chapter-cache';

// 阅读扩展表 DAO（TTS / TOC / 字典等）
export * from '@/lib/database/txt-toc-rules';
export * from '@/lib/database/read-record-details';
export * from '@/lib/database/read-record-sessions';
export * from '@/lib/database/http-tts';
export * from '@/lib/database/rule-subs';
export * from '@/lib/database/dict-rules';
export * from '@/lib/database/keyboard-assists';
export * from '@/lib/database/servers';

export { BASELINE_SCHEMA_VERSION } from '@/lib/database/migrations';

// 数据库导出/导入功能
export * from '@/lib/database/export-import';

// 数据库备份管理器
export * from '@/lib/database/backup-manager';

// 数据库文件位置工具
export * from '@/lib/database/db-location';
