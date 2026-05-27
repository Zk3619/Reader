/**
 * 章节类型定义
 * 对应 legado 项目的 BookChapter.kt
 */

/**
 * 章节实体（完整）
 */
export interface BookChapter {
  /** 章节地址 */
  url: string;
  /** 章节标题 */
  title: string;
  /** 是否是卷名 */
  isVolume: boolean;
  /** 用来拼接相对URL的基础URL */
  baseUrl: string;
  /** 书籍地址 */
  bookUrl: string;
  /** 章节序号 */
  index: number;
  /** 是否VIP */
  isVip: boolean;
  /** 是否已购买 */
  isPay: boolean;
  /** 音频真实URL */
  resourceUrl?: string;
  /** 更新时间或其他章节附加信息 */
  tag?: string;
  /** 章节起始位置（用于本地书籍） */
  start?: number;
  /** 章节终止位置（用于本地书籍） */
  end?: number;
  /** EPUB书籍当前章节的fragmentId */
  startFragmentId?: string;
  /** EPUB书籍下一章节的fragmentId */
  endFragmentId?: string;
  /** 变量（用于书源规则） */
  variable?: string;
  /** 本章节字数 */
  wordCount?: string;
  /** 章节图片 URL */
  imgUrl?: string;
}

/**
 * 新建章节（用于添加章节到数据库）
 */
export interface NewBookChapter {
  url: string;
  title: string;
  bookUrl: string;
  index: number;
  baseUrl?: string;
  isVolume?: boolean;
  isVip?: boolean;
  isPay?: boolean;
  resourceUrl?: string;
  tag?: string;
  wordCount?: string;
  variable?: string;
}

/**
 * 章节内容（用于阅读）
 */
export interface ChapterContent {
  /** 章节URL */
  url: string;
  /** 章节标题 */
  title: string;
  /** 章节内容 */
  content: string;
  /** 书籍URL */
  bookUrl: string;
  /** 章节索引 */
  index: number;
  /** 是否缓存 */
  isCached: boolean;
}

/**
 * 章节缓存（用于存储章节内容）
 */
export interface ChapterCache {
  /** 书籍URL */
  bookUrl: string;
  /** 章节索引 */
  chapterIndex: number;
  /** 章节内容（大文件时为空，见 filePath） */
  content: string;
  /** 落盘路径（Tauri 绝对路径或 opfs: 引用） */
  filePath?: string | null;
  /** 创建时间 */
  createdAt: number;
}
