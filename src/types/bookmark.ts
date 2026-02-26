/**
 * 书签类型定义
 * 对应 legado 项目的 Bookmark.kt
 */

/**
 * 书签实体
 */
export interface Bookmark {
  /** 时间戳（主键） */
  time: number;
  /** 书籍名称 */
  bookName: string;
  /** 书籍作者 */
  bookAuthor: string;
  /** 章节索引 */
  chapterIndex: number;
  /** 章节位置 */
  chapterPos: number;
  /** 章节名称 */
  chapterName: string;
  /** 书籍文本 */
  bookText: string;
  /** 内容 */
  content: string;
}
