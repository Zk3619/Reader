import {
  deleteSubEntriesByFeed,
  deleteSubFeed,
  deleteSubSource,
  listSubEntries,
  listSubFeeds,
  listSubSources,
  markSubEntryRead,
  markSubEntryStarred,
  setSubSourceEnabled,
  touchSubSourceFetchTime,
  upsertSubEntry,
  upsertSubFeed,
  upsertSubSource,
  type ListSubEntriesOptions,
  type SubEntryRow,
  type SubFeedRow,
  type SubSourceRow,
} from '@/lib/database/subscribe';
import { upsertSubSearchKeyword } from '@/lib/database/module-search-keywords';

export interface SubscribeFeedItem {
  id: string;
  title: string;
  link: string;
  author: string;
  publishedAt: number | null;
  content: string;
}

function createId(prefix: string, seed: string): string {
  if (!seed) return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function textOf(node: ParentNode, selector: string): string {
  return node.querySelector(selector)?.textContent?.trim() ?? '';
}

function parseDate(input: string): number | null {
  if (!input) return null;
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function parseFeedXml(xml: string): {
  title: string;
  siteUrl: string | null;
  description: string | null;
  entries: SubscribeFeedItem[];
} {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserErr = doc.querySelector('parsererror');
  if (parserErr) throw new Error('订阅源解析失败');

  const rssChannel = doc.querySelector('rss > channel');
  const atomFeed = doc.querySelector('feed');
  const root = rssChannel ?? atomFeed;
  if (!root) throw new Error('不支持的订阅格式');

  const title = textOf(root, 'title');
  const description = textOf(root, 'description') || textOf(root, 'subtitle') || null;

  let siteUrl: string | null = null;
  const atomAltLink = atomFeed?.querySelector('link[rel="alternate"]')?.getAttribute('href');
  const rootLink = textOf(root, 'link');
  siteUrl = atomAltLink?.trim() || rootLink || null;

  const entries: SubscribeFeedItem[] = [];
  const rssItems = [...doc.querySelectorAll('rss > channel > item')];
  const atomItems = [...doc.querySelectorAll('feed > entry')];
  const list = rssItems.length ? rssItems : atomItems;
  for (const item of list) {
    const link = textOf(item, 'link') || item.querySelector('link')?.getAttribute('href')?.trim() || '';
    const id = textOf(item, 'guid') || textOf(item, 'id') || link;
    if (!id) continue;
    entries.push({
      id,
      title: textOf(item, 'title') || '无标题',
      link,
      author:
        textOf(item, 'author > name') ||
        textOf(item, 'author') ||
        textOf(item, 'dc\\:creator') ||
        '',
      publishedAt:
        parseDate(textOf(item, 'pubDate')) ||
        parseDate(textOf(item, 'published')) ||
        parseDate(textOf(item, 'updated')),
      content:
        textOf(item, 'content\\:encoded') ||
        textOf(item, 'content') ||
        textOf(item, 'description') ||
        textOf(item, 'summary') ||
        '',
    });
  }

  return { title: title || '未命名订阅源', siteUrl, description, entries };
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`抓取失败: ${res.status}`);
  return await res.text();
}

export async function createSubscribeSource(input: {
  title: string;
  url: string;
  type?: SubSourceRow['type'];
}): Promise<string> {
  const url = input.url.trim();
  const id = createId('subsrc', `${url}|${input.title}`);
  await upsertSubSource({
    id,
    url,
    title: input.title.trim() || url,
    type: input.type ?? 'rss',
    enabled: true,
    metaJson: '{}',
  });
  return id;
}

export async function refreshSubscribeSource(sourceId: string): Promise<number> {
  const source = (await listSubSources()).find((item) => item.id === sourceId);
  if (!source) throw new Error('订阅源不存在');
  const xml = await fetchFeed(source.url);
  const parsed = parseFeedXml(xml);
  const feedId = createId('subfeed', `${sourceId}|${source.url}`);
  await upsertSubFeed({
    id: feedId,
    sourceId,
    feedUrl: source.url,
    title: parsed.title || source.title,
    siteUrl: parsed.siteUrl,
    description: parsed.description,
    metaJson: JSON.stringify({ sourceType: source.type }),
  });
  const now = Date.now();
  let count = 0;
  for (const item of parsed.entries) {
    const entryId = createId('subentry', `${feedId}|${item.id}|${item.link}`);
    await upsertSubEntry({
      id: entryId,
      feedId,
      title: item.title,
      url: item.link || null,
      author: item.author || null,
      publishedAt: item.publishedAt,
      read: false,
      starred: false,
      content: item.content || null,
      metaJson: '{}',
      createdAt: now,
    });
    count += 1;
  }
  await touchSubSourceFetchTime(sourceId, now);
  return count;
}

export async function searchSubscribeEntries(
  query: string,
  options: Omit<ListSubEntriesOptions, 'query'> = {},
): Promise<SubEntryRow[]> {
  if (query.trim()) await upsertSubSearchKeyword(query.trim());
  return listSubEntries({ ...options, query });
}

export async function listSubscribeDashboard(options?: {
  sourceId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  query?: string;
}): Promise<{
  sources: SubSourceRow[];
  feeds: SubFeedRow[];
  entries: SubEntryRow[];
}> {
  const sources = await listSubSources();
  const feeds = await listSubFeeds(options?.sourceId);
  const feedIds = new Set(feeds.map((f) => f.id));
  const entries = (
    await listSubEntries({
      unreadOnly: options?.unreadOnly,
      starredOnly: options?.starredOnly,
      query: options?.query,
      limit: 300,
    })
  ).filter((entry) => (options?.sourceId ? feedIds.has(entry.feedId) : true));
  return { sources, feeds, entries };
}

export async function removeSubscribeSource(sourceId: string): Promise<void> {
  const feeds = await listSubFeeds(sourceId);
  for (const feed of feeds) {
    await deleteSubEntriesByFeed(feed.id);
    await deleteSubFeed(feed.id);
  }
  await deleteSubSource(sourceId);
}

export async function updateSubscribeSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  await setSubSourceEnabled(sourceId, enabled);
}

export async function updateSubscribeEntryRead(entryId: string, read: boolean): Promise<void> {
  await markSubEntryRead(entryId, read);
}

export async function updateSubscribeEntryStarred(entryId: string, starred: boolean): Promise<void> {
  await markSubEntryStarred(entryId, starred);
}
