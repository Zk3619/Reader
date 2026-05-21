/**
 * 搜索书籍类型定义
 * 对应 legado 项目的 SearchBook.kt
 */

import type { BaseBook } from '@/types/base-book';

/**
 * 搜索书籍结果实体
 */
export interface SearchBook extends BaseBook {
  /** 书源URL */
  origin: string;
  /** 书源名称 */
  originName: string;
  /** 类型 */
  type: number;
  /** 封面URL */
  coverUrl?: string;
  /** 简介 */
  intro?: string;
  /** 最新章节标题 */
  latestChapterTitle?: string;
  /** 最新章节更新时间（发现列表展示） */
  latestChapterUpdateTime?: string;
  /** 目录页URL */
  tocUrl: string;
  /** 来源/书源名（发现列表徽章） */
  source?: string;
  /** 状态（如连载中/已完结） */
  status?: string;
  /** 标签页（如小说） */
  tab?: string;
  /** 分类（发现列表徽章） */
  category?: string;
  /** 标签（发现列表徽章） */
  tags?: string;
  /** 评分（发现列表徽章） */
  score?: string;
  /** 时间戳 */
  time: number;
  /** 书源排序 */
  originOrder: number;
  /** 章节字数文本 */
  chapterWordCountText?: string;
  /** 章节字数 */
  chapterWordCount: number;
  /** 响应时间 */
  respondTime: number;
}
