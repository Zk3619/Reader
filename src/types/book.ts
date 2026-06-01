/**
 * 书籍类型定义
 * 对应 legado 项目的 Book.kt
 */

import type { BaseBook } from '@/types/base-book';

/**
 * 阅读配置
 */
export interface ReadConfig {
  /** 目录倒序 */
  reverseToc?: boolean;
  /** 使用替换规则 */
  useReplaceRule?: boolean;
  /** 本地书自定义目录正则（legado 风格），如 "^\s*第[一二三四五六七八九十百千\\d]+章\\s*.*$" */
  tocRule?: string;
  /** 音频片头跳过秒数（Legado openCredits） */
  openCredits?: number;
  /** 音频片尾跳过秒数（Legado closeCredits） */
  closeCredits?: number;
  /** 音频播放模式 0–3（Legado playMode） */
  playMode?: number;
  /** 音频播放速度（Legado playSpeed） */
  playSpeed?: number;
  /** 其他阅读配置... */
  [key: string]: unknown;
}

/**
 * 书籍实体（完整）
 */
export interface Book extends BaseBook {
  /** 目录页URL (toc=table of Contents) */
  tocUrl: string;
  /** 书源URL（默认 BookType.local） */
  origin: string;
  /** 书源名称 or 本地书籍文件名 */
  originName: string;
  /** 分类信息（用户修改） */
  customTag?: string;
  /** 封面URL（书源获取） */
  coverUrl?: string;
  /** 封面URL（用户修改） */
  customCoverUrl?: string;
  /** 简介内容（书源获取） */
  intro?: string;
  /** 简介内容（用户修改） */
  customIntro?: string;
  /** 自定义字符集名称（仅适用于本地书籍） */
  charset?: string;
  /** 类型：书源枚举 0–4 或 Legado BookType 位标志，见 lib/book-source/book-type */
  type: number;
  /** 自定义分组索引号 */
  group: number;
  /** 最新章节标题 */
  latestChapterTitle?: string;
  /** 最新章节标题更新时间 */
  latestChapterTime: number;
  /** 最近一次更新书籍信息的时间 */
  lastCheckTime: number;
  /** 最近一次发现新章节的数量 */
  lastCheckCount: number;
  /** 书籍目录总数 */
  totalChapterNum: number;
  /** 当前章节名称 */
  durChapterTitle?: string;
  /** 当前章节索引 */
  durChapterIndex: number;
  /** 当前章阅读位置（0–1 滚动比例，与阅读器底栏一致） */
  durChapterPos: number;
  /** 当前分卷索引 */
  durVolumeIndex: number;
  /** 分卷内章节索引 */
  chapterInVolumeIndex: number;
  /** 最近一次阅读书籍的时间（打开正文的时间） */
  durChapterTime: number;
  /** 刷新书架时更新书籍信息 */
  canUpdate: boolean;
  /** 手动排序 */
  order: number;
  /** 书源排序 */
  originOrder: number;
  /** 阅读设置 */
  readConfig?: ReadConfig;
  /** 同步时间 */
  syncTime: number;
}

/**
 * 新建书籍（用于添加书籍到书架）
 */
export interface NewBook {
  bookUrl: string;
  name: string;
  author?: string;
  kind?: string;
  intro?: string;
  coverUrl?: string;
  charset?: string;
  origin: string;
  originName?: string;
  tocUrl?: string;
  type?: number;
  variable?: string;
}

/**
 * 书籍信息（用于书籍详情页）
 */
export interface BookInfo extends BaseBook {
  /** 书源URL */
  origin: string;
  /** 书源名称 */
  originName: string;
  /** 封面URL */
  coverUrl?: string;
  /** 简介 */
  intro?: string;
  /** 最新章节标题 */
  latestChapterTitle?: string;
  /** 最新章节更新时间 */
  latestChapterUpdateTime?: string;
  /** 目录页URL */
  tocUrl: string;
  /** 来源/数据源名称 (如 "番茄") */
  source?: string;
  /** 状态 (如 "连载中"/"已完结") */
  status?: string;
  /** 标签页类型 (如 "小说"/"听书") */
  tab?: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string;
  /** 评分 */
  score?: string;
}

/**
 * 书籍进度（用于阅读记录）
 */
export type BookProgress = Pick<
  Book,
  | 'name'
  | 'author'
  | 'durChapterIndex'
  | 'durChapterPos'
  | 'durChapterTime'
  | 'durChapterTitle'
>;
