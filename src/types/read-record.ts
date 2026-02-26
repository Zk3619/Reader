/**
 * 阅读记录类型定义
 * 对应 legado 项目的 ReadRecord.kt
 */

/**
 * 阅读记录实体
 */
export interface ReadRecord {
  /** 设备ID（主键之一） */
  deviceId: string;
  /** 书籍名称（主键之一） */
  bookName: string;
  /** 阅读时间 */
  readTime: number;
  /** 最后阅读时间 */
  lastRead: number;
}
