import { SubTables } from '@/lib/database/table-names';

const SUB_TABLE_SET = new Set<string>([
  SubTables.sources,
  SubTables.feeds,
  SubTables.entries,
  SubTables.searchKeywords,
]);

/**
 * 订阅模块写入保护：禁止任何 reader_rss_* 写操作混入订阅模块。
 */
export function assertSubscribeTable(table: string): void {
  if (!SUB_TABLE_SET.has(table)) {
    throw new Error(`[subscribe-db] illegal table access: ${table}`);
  }
}

export function assertNoLegacyRssSql(sql: string): void {
  if (/reader_rss_/i.test(sql)) {
    throw new Error('[subscribe-db] blocked legacy rss table write');
  }
}
