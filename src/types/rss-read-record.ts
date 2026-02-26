/**
 * RSS阅读记录类型定义
 * 对应 legado 项目的 RssReadRecord.kt
 */

/**
 * RSS阅读记录实体
 */
export interface RssReadRecord {
  /** 记录标识（主键，通常是 origin + link 的组合） */
  record: string;
  /** 标题 */
  title?: string;
  /** 阅读时间 */
  readTime?: number;
  /** 是否已读 */
  read: boolean;
}
