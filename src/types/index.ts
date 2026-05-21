/**
 * 类型定义统一导出
 * 对应 legado 项目的 entities 目录结构
 */

// 基础接口
export type { BaseBook } from '@/types/base-book';
export type { BaseSource } from '@/types/base-source';
export type { BaseRssArticle } from '@/types/base-rss-article';

// 书籍相关类型
export type {
  Book,
  NewBook,
  BookInfo,
  BookProgress,
  ReadConfig,
} from '@/types/book';

// 书源相关类型
export type { BookSource, NewBookSource } from '@/types/book-source';

// 章节相关类型
export type {
  BookChapter,
  NewBookChapter,
  ChapterContent,
  ChapterCache,
} from '@/types/book-chapter';

// 搜索相关类型
export type { SearchBook } from '@/types/search-book';
export type { SearchKeyword } from '@/types/search-keyword';

// 分组相关类型
export type { BookGroup } from '@/types/book-group';
export { BookGroupId } from '@/types/book-group';

// 书签相关类型
export type { Bookmark } from '@/types/bookmark';

// 替换规则类型
export type { ReplaceRule } from '@/types/replace-rule';

// 阅读记录类型
export type { ReadRecord } from '@/types/read-record';

// 远程书籍相关类型
export type {
  RemoteBook,
  RemoteBookManager,
  WebDavConfig,
  RemoteBookSort,
} from '@/types/remote-book';

// RSS订阅相关类型
export type { RssSource, NewRssSource } from '@/types/rss-source';
export type { RssArticle, NewRssArticle } from '@/types/rss-article';
export type { RssStar } from '@/types/rss-star';
export type { RssReadRecord } from '@/types/rss-read-record';

// 规则类型
export type {
  SearchRule,
  ExploreRule,
  BookInfoRule,
  TocRule,
  ContentRule,
  ReviewRule,
} from '@/types/rule';

// 书源联合类型（书籍源或RSS源）
import type { BookSource } from '@/types/book-source';
import type { RssSource } from '@/types/rss-source';
export type Source = BookSource | RssSource;
