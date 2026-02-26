/**
 * 基础RSS文章接口
 * 对应 legado 项目的 BaseRssArticle.kt
 */

/**
 * 基础RSS文章接口（所有RSS文章类型共享的字段）
 */
export interface BaseRssArticle {
  /** 来源URL（RSS源URL） */
  origin: string;
  /** 文章链接 */
  link: string;
  /** 变量（用于书源规则） */
  variable?: string;
}
