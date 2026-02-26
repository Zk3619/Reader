/**
 * 基础书籍接口
 * 对应 legado 项目的 BaseBook.kt
 */

/**
 * 基础书籍接口（所有书籍类型共享的字段）
 */
export interface BaseBook {
  /** 书籍名称 */
  name: string;
  /** 作者名称 */
  author: string;
  /** 详情页URL（本地书源存储完整文件路径） */
  bookUrl: string;
  /** 分类信息 */
  kind?: string;
  /** 字数 */
  wordCount?: string;
  /** 自定义书籍变量信息（用于书源规则检索书籍信息） */
  variable?: string;
  /** 信息HTML（忽略序列化） */
  infoHtml?: string;
  /** 目录HTML（忽略序列化） */
  tocHtml?: string;
}
