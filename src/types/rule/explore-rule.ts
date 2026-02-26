/**
 * 发现规则类型定义
 * 对应 legado 项目的 ExploreRule.kt
 */

/**
 * 发现规则
 */
export interface ExploreRule {
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
  /** 来源/书源名规则（发现列表徽章） */
  source?: string;
  /** 状态规则（如连载中/已完结） */
  status?: string;
  /** 标签页规则（如小说） */
  tab?: string;
  /** 分类规则（发现列表徽章，与 kind 可能同源） */
  category?: string;
  /** 标签规则（多标签） */
  tags?: string;
  /** 评分规则 */
  score?: string;
}
