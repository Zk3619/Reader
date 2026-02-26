/**
 * RSS收藏类型定义
 * 对应 legado 项目的 RssStar.kt
 */

import type { BaseRssArticle } from './base-rss-article';

/**
 * RSS收藏实体（完整）
 */
export interface RssStar extends BaseRssArticle {
  /** 分类名称 */
  sort: string;
  /** 标题 */
  title: string;
  /** 收藏时间 */
  starTime: number;
  /** 发布日期 */
  pubDate?: string;
  /** 描述 */
  description?: string;
  /** 正文内容 */
  content?: string;
  /** 图片URL */
  image?: string;
  /** 收藏分组 */
  group: string;
}
