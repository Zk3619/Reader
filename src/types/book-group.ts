/**
 * 书籍分组类型定义
 * 对应 legado 项目的 BookGroup.kt
 */

/**
 * 书籍分组实体
 */
export interface BookGroup {
  /** 分组ID（主键） */
  groupId: number;
  /** 分组名称 */
  groupName: string;
  /** 封面 */
  cover?: string;
  /** 排序 */
  order: number;
  /** 启用刷新 */
  enableRefresh: boolean;
  /** 是否显示 */
  show: boolean;
  /** 书籍排序方式 */
  bookSort: number;
}

/**
 * 分组ID常量
 */
export const BookGroupId = {
  /** 根分组 */
  Root: -100,
  /** 全部分组 */
  All: -1,
  /** 本地分组 */
  Local: -2,
  /** 音频分组 */
  Audio: -3,
  /** 网络无分组 */
  NetNone: -4,
  /** 本地无分组 */
  LocalNone: -5,
  /** 错误分组 */
  Error: -11,
} as const;
