import { describe, expect, it } from 'vitest';
import { assertNoLegacyRssSql, assertSubscribeTable } from '@/lib/database/subscribe-guard';
import { SubTables } from '@/lib/database/table-names';

describe('subscribe-guard', () => {
  it('accepts known sub tables', () => {
    expect(() => assertSubscribeTable(SubTables.sources)).not.toThrow();
    expect(() => assertSubscribeTable(SubTables.entries)).not.toThrow();
  });

  it('blocks non-sub tables', () => {
    expect(() => assertSubscribeTable('reader_rss_sources')).toThrow(/illegal table access/);
  });

  it('blocks legacy rss sql usage', () => {
    expect(() => assertNoLegacyRssSql('UPDATE reader_rss_sources SET enabled = 1')).toThrow(
      /blocked legacy rss table write/,
    );
    expect(() => assertNoLegacyRssSql('UPDATE sub_sources SET enabled = 1')).not.toThrow();
  });
});
