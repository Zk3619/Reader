import type { SubEntryRow, SubFeedRow, SubSourceRow } from '@/lib/database/subscribe';

export interface FoloSubscriptionLike {
  id: string;
  title?: string;
  url: string;
  type?: string;
  category?: string;
  disabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface FoloFeedLike {
  id: string;
  subscriptionId?: string;
  feedUrl: string;
  title?: string;
  siteUrl?: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface FoloEntryLike {
  id: string;
  feedId: string;
  title?: string;
  url?: string;
  author?: string;
  content?: string;
  publishedAt?: number | string;
  read?: boolean;
  starred?: boolean;
  createdAt?: number;
}

function toEpochMs(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const ms = Date.parse(input);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

export function mapFoloSubscriptionToSubSource(
  input: FoloSubscriptionLike,
): Omit<SubSourceRow, 'lastFetchAt'> & { lastFetchAt?: number | null } {
  return {
    id: String(input.id),
    url: String(input.url ?? '').trim(),
    type: ((input.type || 'rss').toLowerCase() as SubSourceRow['type']) || 'rss',
    title: String(input.title ?? input.url ?? ''),
    category: String(input.category ?? '').trim(),
    enabled: input.disabled !== true,
    lastFetchAt: null,
    metaJson: '{}',
    createdAt: Number(input.createdAt ?? Date.now()),
    updatedAt: Number(input.updatedAt ?? Date.now()),
  };
}

export function mapFoloFeedToSubFeed(input: FoloFeedLike): SubFeedRow {
  return {
    id: String(input.id),
    sourceId: input.subscriptionId ? String(input.subscriptionId) : null,
    feedUrl: String(input.feedUrl ?? '').trim(),
    title: String(input.title ?? input.feedUrl ?? ''),
    siteUrl: input.siteUrl ? String(input.siteUrl) : null,
    description: input.description ? String(input.description) : null,
    metaJson: '{}',
    createdAt: Number(input.createdAt ?? Date.now()),
    updatedAt: Number(input.updatedAt ?? Date.now()),
  };
}

export function mapFoloEntryToSubEntry(input: FoloEntryLike): SubEntryRow {
  return {
    id: String(input.id),
    feedId: String(input.feedId),
    title: String(input.title ?? ''),
    url: input.url ? String(input.url) : null,
    author: input.author ? String(input.author) : null,
    publishedAt: toEpochMs(input.publishedAt),
    read: input.read === true,
    starred: input.starred === true,
    content: input.content ? String(input.content) : null,
    metaJson: '{}',
    createdAt: Number(input.createdAt ?? Date.now()),
  };
}
