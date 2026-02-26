/**
 * 正文规则类型定义
 * 对应 legado 项目的 ContentRule.kt
 */

/**
 * 正文规则
 */
export interface ContentRule {
  /** 正文内容规则 */
  content?: string;
  /** 标题规则（有些网站只能在正文中获取标题） */
  title?: string;
  /** 下一页正文URL规则 */
  nextContentUrl?: string;
  /** Web JS */
  webJs?: string;
  /** 源正则 */
  sourceRegex?: string;
  /** 替换规则 */
  replaceRegex?: string;
  /** 图片样式（默认大小居中，FULL最大宽度） */
  imageStyle?: string;
  /** 图片解密JS（图片bytes二次解密js，返回解密后的bytes） */
  imageDecode?: string;
  /** 购买操作（js或者包含{{js}}的url） */
  payAction?: string;
}
