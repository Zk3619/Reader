import { dispatchRssSourcesRefresh } from '@/lib/rss/rss-sources-refresh-event';
import type { NewRssSource } from '@/types';
import * as rssDb from '@/lib/database/rss-sources';

export async function importRssSourcesFromList(sources: NewRssSource[]): Promise<number> {
  let count = 0;
  for (const source of sources) {
    if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;
    await rssDb.insertRssSource(source);
    count += 1;
  }
  if (count > 0) {
    dispatchRssSourcesRefresh({ reason: 'source-added', invalidateCache: true });
  }
  return count;
}
