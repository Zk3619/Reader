import type { RssReadRecord } from '@/types';

export function rssReadRecordMatchesSearch(record: RssReadRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (record.title?.toLowerCase().includes(q) ?? false) ||
    record.record.toLowerCase().includes(q)
  );
}
