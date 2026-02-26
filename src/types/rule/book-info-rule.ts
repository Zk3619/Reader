/**
 * 书籍信息规则类型定义
 * 对应 legado 项目的 BookInfoRule.kt
 */

/**
 * 书籍信息规则
 */
export interface BookInfoRule {
  /** 初始化JS */
  init?: string;
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
  /** 封面URL规则 */
  coverUrl?: string;
  /** 目录URL规则 */
  tocUrl?: string;
  /** 字数规则 */
  wordCount?: string;
  /** 可重命名规则 */
  canReName?: string;
  /** 下载URL规则 */
  downloadUrls?: string;
}
