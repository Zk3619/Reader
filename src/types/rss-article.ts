/**
 * RSS文章类型定义
 * 对应 legado 项目的 RssArticle.kt
 */

import type { BaseRssArticle } from '@/types/base-rss-article';

/**
 * RSS文章实体（完整）
 */
export interface RssArticle extends BaseRssArticle {
  /** 分类名称 */
  sort: string;
  /** 标题 */
  title: string;
  /** 排序 */
  order: number;
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
  /** 已读状态 */
  read: boolean;
}

/**
 * 新建RSS文章（用于添加文章）
 */
export interface NewRssArticle {
  origin: string;
  link: string;
  sort?: string;
  title: string;
  order?: number;
  pubDate?: string;
  description?: string;
  content?: string;
  image?: string;
  group?: string;
  read?: boolean;
  variable?: string;
}
