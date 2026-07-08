/**
 * RSS 源批量导入（带合并策略）
 */

import * as rssSourcesDb from '@/lib/database/rss-sources';
import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import { assertRssSourceNetworkJson } from '@/lib/book-source/import-network-sidecar';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { mergeRssSourceForImport, type ImportRssSourceOptions } from '@/lib/book-source/import-rss-merge';
import { dispatchRssSourcesRefresh } from '@/lib/rss/rss-sources-refresh-event';
import type { NewRssSource } from '@/types';

export type { ImportRssSourceComparison } from '@/lib/book-source/import-rss-compare';
export {
  buildRssImportComparisons,
  defaultRssImportSelection,
} from '@/lib/book-source/import-rss-compare';

export async function resolveRssSourcesFromNetworkUrl(
  url: string,
): Promise<NewRssSource[]> {
  const text = await fetchBookSourceJsonText(url.trim());
  await assertRssSourceNetworkJson(text);
  return parseRssSourceJson(text);
}

export async function resolveRssSourcesFromText(text: string): Promise<NewRssSource[]> {
  return parseRssSourceJson(text);
}

export async function importSelectedRssSources(
  sources: NewRssSource[],
  options: ImportRssSourceOptions = {},
): Promise<number> {
  let inserted = 0;
  for (const incoming of sources) {
    const existing = await rssSourcesDb.getRssSource(incoming.sourceUrl);
    const merged = mergeRssSourceForImport(incoming, existing, options);
    await rssSourcesDb.insertRssSource(merged);
    inserted += 1;
  }
  if (inserted > 0) {
    dispatchRssSourcesRefresh({ reason: 'source-added', invalidateCache: true });
  }
  return inserted;
}
