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
  ChapterCacheTier,
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
export type { ReadRecordDetail } from '@/types/read-record-detail';
export type { ReadRecordSession } from '@/types/read-record-session';

// Legado v96 扩展实体
export type { TxtTocRule } from '@/types/txt-toc-rule';
export type { HttpTTS } from '@/types/http-tts';
export type { RuleSub } from '@/types/rule-sub';
export type { DictRule } from '@/types/dict-rule';
export type { KeyboardAssist } from '@/types/keyboard-assist';
export type { Server } from '@/types/server';
export type { UrlRecord } from '@/types/url-record';
export type { DirectLinkUploadRule } from '@/types/direct-link-upload-rule';
export type { UploadHistory } from '@/types/upload-history';

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
