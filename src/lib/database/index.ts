/**
 * 数据库模块统一导出
 * 对应 legado 项目的 AppDatabase.kt
 */

// 数据库初始化和管理
export { initDatabase, getDatabase, closeDatabase } from './database-core';

// 书籍相关DAO
export * from './books';

// 章节相关DAO
export * from './chapters';

// 书源相关DAO
export * from './sources';

// 分组相关DAO
export * from './book-groups';

// 书签相关DAO
export * from './bookmarks';

// 替换规则相关DAO
export * from './replace-rules';

// 搜索结果相关DAO
export * from './search-books';

// 搜索关键词相关DAO
export * from './search-keywords';

// 阅读记录相关DAO
export * from './read-records';

// RSS源相关DAO
export * from './rss-sources';

// RSS文章相关DAO
export * from './rss-articles';

// RSS收藏相关DAO
export * from './rss-stars';

// RSS阅读记录相关DAO
export * from './rss-read-records';

// 章节缓存相关DAO
export * from './chapter-cache';

// 数据库导出/导入功能
export * from './export-import';

// 数据库备份管理器
export * from './backup-manager';

// 数据库文件位置工具
export * from './db-location';
