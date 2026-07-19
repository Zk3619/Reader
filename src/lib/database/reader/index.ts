/** 阅读模块数据库 API（M4 目录边界） */
export * from '@/lib/database/books';
export * from '@/lib/database/bookmarks';
export * from '@/lib/database/chapters';
export * from '@/lib/database/chapter-cache';
export * from '@/lib/database/sources';
export * from '@/lib/database/search-books';
export * from '@/lib/database/search-keywords';
export * from '@/lib/database/replace-rules';
export * from '@/lib/database/rss-sources';
export * from '@/lib/database/rss-articles';
export * from '@/lib/database/rss-stars';
export * from '@/lib/database/rss-read-records';
export * from '@/lib/database/read-records';
export * from '@/lib/database/book-groups';
export { ReaderTables } from '@/lib/database/table-names';
export {
  mapLegadoTableToReader,
  mapReaderTableToLegado,
  LEGADO_TO_READER,
  READER_TO_LEGADO,
} from '@/lib/database/core/legado-table-map';
