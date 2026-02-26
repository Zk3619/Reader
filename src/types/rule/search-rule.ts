/**
 * 搜索规则类型定义
 * 对应 legado 项目的 SearchRule.kt
 */

/**
 * 搜索规则
 */
export interface SearchRule {
  /** 校验关键字 */
  checkKeyWord?: string;
  /** 书籍列表规则 */
  bookList?: string;
  /** 书名规则 */
  name?: string;
  /** 作者规则 */
  author?: string;
  /** 简介规则 */
  intro?: string;
  /** 分类规则 */
  kind?: string;
  /** 最新章节规则 */
  lastChapter?: string;
  /** 更新时间规则 */
  updateTime?: string;
  /** 书籍URL规则 */
  bookUrl?: string;
  /** 封面URL规则 */
  coverUrl?: string;
  /** 字数规则 */
  wordCount?: string;
}
