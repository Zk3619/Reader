/**
 * 数据库迁移 v112 — M3：阅读表加 reader_ 前缀 + 兼容 VIEW
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  createCompatView,
  renameTableIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { ReaderTables } from '@/lib/database/table-names';

export const READER_PREFIX_SCHEMA_VERSION = 112;

/** Legado 无前缀表名 → MediaBox reader_* */
export const READER_TABLE_RENAMES: Array<{ from: string; to: string }> = [
  { from: 'books', to: ReaderTables.books },
  { from: 'chapters', to: ReaderTables.chapters },
  { from: 'chapter_cache', to: ReaderTables.chapterCache },
  { from: 'book_sources', to: ReaderTables.bookSources },
  { from: 'searchBooks', to: ReaderTables.searchBooks },
  { from: 'search_keywords', to: ReaderTables.searchKeywords },
  { from: 'replace_rules', to: ReaderTables.replaceRules },
  { from: 'rssSources', to: ReaderTables.rssSources },
  { from: 'rssArticles', to: ReaderTables.rssArticles },
  { from: 'rssStars', to: ReaderTables.rssStars },
  { from: 'rssReadRecords', to: ReaderTables.rssReadRecords },
  { from: 'bookmarks', to: ReaderTables.bookmarks },
  { from: 'readRecord', to: ReaderTables.readRecord },
  { from: 'readRecordDetail', to: ReaderTables.readRecordDetail },
  { from: 'readRecordSession', to: ReaderTables.readRecordSession },
  { from: 'httpTTS', to: ReaderTables.httpTts },
  { from: 'txtTocRules', to: ReaderTables.txtTocRules },
  { from: 'dictRules', to: ReaderTables.dictRules },
  { from: 'ruleSubs', to: ReaderTables.ruleSubs },
  { from: 'keyboardAssists', to: ReaderTables.keyboardAssists },
];

export async function migrateReaderPrefixV112(db: DatabaseAdapter): Promise<void> {
  for (const { from, to } of READER_TABLE_RENAMES) {
    await renameTableIfExists(db, from, to);
  }

  // 过渡兼容 VIEW：旧 DAO / 外部工具仍可用无前缀名读
  for (const { from, to } of READER_TABLE_RENAMES) {
    if (await tableExists(db, to)) {
      await createCompatView(db, from, to);
    }
  }

  await setSchemaModuleVersion(db, 'reader', 3);
}
