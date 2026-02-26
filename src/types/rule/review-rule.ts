/**
 * 段评规则类型定义
 * 对应 legado 项目的 ReviewRule.kt
 */

/**
 * 段评规则
 */
export interface ReviewRule {
  /** 段评列表规则 */
  reviewList?: string;
  /** 段评内容规则 */
  reviewContent?: string;
  /** 段评作者规则 */
  reviewAuthor?: string;
  /** 段评时间规则 */
  reviewTime?: string;
  /** 其他段评相关规则... */
  [key: string]: string | undefined;
}
