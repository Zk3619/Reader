/**
 * 替换规则类型定义
 * 对应 legado 项目的 ReplaceRule.kt
 */

/**
 * 替换规则实体
 */
export interface ReplaceRule {
  /** ID（主键，自增） */
  id: number;
  /** 名称 */
  name: string;
  /** 分组 */
  group?: string;
  /** 替换内容（正则表达式或普通文本） */
  pattern: string;
  /** 替换为 */
  replacement: string;
  /** 作用范围 */
  scope?: string;
  /** 作用于标题 */
  scopeTitle: boolean;
  /** 作用于正文 */
  scopeContent: boolean;
  /** 排除范围 */
  excludeScope?: string;
  /** 是否启用 */
  isEnabled: boolean;
  /** 是否正则表达式 */
  isRegex: boolean;
  /** 超时时间（毫秒） */
  timeoutMillisecond: number;
  /** 排序 */
  order: number;
}
