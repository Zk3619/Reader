/**
 * 目录规则类型定义
 * 对应 legado 项目的 TocRule.kt
 */

/**
 * 目录规则
 */
export interface TocRule {
  /** 预更新JS */
  preUpdateJs?: string;
  /** 章节列表规则 */
  chapterList?: string;
  /** 章节名称规则 */
  chapterName?: string;
  /** 章节URL规则 */
  chapterUrl?: string;
  /** 格式化JS */
  formatJs?: string;
  /** 是否卷名规则 */
  isVolume?: string;
  /** 是否VIP规则 */
  isVip?: string;
  /** 是否付费规则 */
  isPay?: string;
  /** 更新时间规则 */
  updateTime?: string;
  /** 下一页目录URL规则 */
  nextTocUrl?: string;
}
