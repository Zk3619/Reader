/**
 * 搜索关键词类型定义
 * 对应 legado 项目的 SearchKeyword.kt
 */

/**
 * 搜索关键词实体
 */
export interface SearchKeyword {
  /** 搜索关键词（主键） */
  word: string;
  /** 使用次数 */
  usage: number;
  /** 最后一次使用时间 */
  lastUseTime: number;
}
