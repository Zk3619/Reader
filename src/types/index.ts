/**
 * 类型定义统一导出
 * 对应 legado 项目的 entities 目录结构
 */

// 基础接口
export type { BaseBook } from './base-book';
export type { BaseSource } from './base-source';
export type { BaseRssArticle } from './base-rss-article';

// 书籍相关类型
export type {
  Book,
  NewBook,
  BookInfo,
  BookProgress,
  ReadConfig,
} from './book';

// 书源相关类型
export type { BookSource, NewBookSource } from './book-source';

// 章节相关类型
export type {
  BookChapter,
  NewBookChapter,
  ChapterContent,
  ChapterCache,
} from './book-chapter';

// 搜索相关类型
export type { SearchBook } from './search-book';
export type { SearchKeyword } from './search-keyword';

// 分组相关类型
export type { BookGroup } from './book-group';
export { BookGroupId } from './book-group';

// 书签相关类型
export type { Bookmark } from './bookmark';

// 替换规则类型
export type { ReplaceRule } from './replace-rule';

// 阅读记录类型
export type { ReadRecord } from './read-record';

// 远程书籍相关类型
export type {
  RemoteBook,
  RemoteBookManager,
  WebDavConfig,
  RemoteBookSort,
} from './remote-book';

// RSS订阅相关类型
export type { RssSource, NewRssSource } from './rss-source';
export type { RssArticle, NewRssArticle } from './rss-article';
export type { RssStar } from './rss-star';
export type { RssReadRecord } from './rss-read-record';

// 规则类型
export type {
  SearchRule,
  ExploreRule,
  BookInfoRule,
  TocRule,
  ContentRule,
  ReviewRule,
} from './rule';

// 书源联合类型（书籍源或RSS源）
import type { BookSource } from './book-source';
import type { RssSource } from './rss-source';
export type Source = BookSource | RssSource;
