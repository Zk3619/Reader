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
    window.dispatchEvent(new CustomEvent('rss-sources-refresh'));
  }
  return count;
}
