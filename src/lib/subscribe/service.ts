import {
  countUnreadByFeed,
  deleteSubEntriesByFeed,
  deleteSubFeed,
  deleteSubSource,
  getSubEntry,
  getSubSourceByUrl,
  listSubEntries,
  listSubFeeds,
  listSubSources,
  markSubEntryRead,
  markSubEntryStarred,
  markAllSubEntriesRead,
  setSubSourceEnabled,
  touchSubSourceFetchTime,
  updateSubSourceMeta,
  upsertSubEntry,
  upsertSubFeed,
  upsertSubSource,
  type ListSubEntriesOptions,
  type SubEntryCursor,
  type SubEntryRow,
  type SubFeedRow,
  type SubSourceRow,
} from '@/lib/database/subscribe';
import { upsertSubSearchKeyword } from '@/lib/database/module-search-keywords';
import { buildOpml, parseOpml } from '@/lib/subscribe/opml';
import { fetchSubscribeFeedXml } from '@/lib/subscribe/fetch-subscribe-feed';

export interface SubscribeFeedItem {
  id: string;
  title: string;
  link: string;
  author: string;
  publishedAt: number | null;
  /** 列表摘要（对齐 Folo description） */
  description: string;
  /** 阅读正文（对齐 Folo content） */
  content: string;
}

type SubscribeEntryMeta = {
  feedPosition?: number;
  description?: string;
};

export type SubscribeTimelineKind = 'all' | 'today' | 'unread' | 'starred';

export const AUTO_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

function createId(prefix: string, seed: string): string {
  if (!seed) return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function feedPositionOf(entry: SubEntryRow): number {
  try {
    const meta = JSON.parse(entry.metaJson) as SubscribeEntryMeta;
    return Number.isFinite(meta.feedPosition) ? Number(meta.feedPosition) : Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function sortEntriesLikeFolo(entries: SubEntryRow[]): SubEntryRow[] {
  return [...entries].sort((a, b) => {
    const timeA = a.publishedAt ?? a.createdAt;
    const timeB = b.publishedAt ?? b.createdAt;
    if (timeB !== timeA) return timeB - timeA;
    const pos = feedPositionOf(a) - feedPositionOf(b);
    if (pos !== 0) return pos;
    return b.id.localeCompare(a.id);
  });
}

function textOf(node: ParentNode, selector: string): string {
  return node.querySelector(selector)?.textContent?.trim() ?? '';
}

function childTextByLocalNames(item: Element, localNames: string[]): string {
  const wanted = new Set(localNames.map((n) => n.toLowerCase()));
  for (const child of Array.from(item.children)) {
    if (wanted.has(child.localName.toLowerCase())) {
      return child.textContent?.trim() ?? '';
    }
  }
  return '';
}

function pickEntryDescription(item: Element): string {
  return (
    textOf(item, 'description') ||
    textOf(item, 'summary') ||
    childTextByLocalNames(item, ['description', 'summary']) ||
    ''
  );
}

function pickEntryContent(item: Element): string {
  // content:encoded 在 DOMParser 下 localName 多为 encoded，CSS 选择器 content\:encoded 常失效
  const fullCandidates: string[] = [];
  for (const child of Array.from(item.children)) {
    const local = child.localName.toLowerCase();
    const ns = (child.namespaceURI || '').toLowerCase();
    const prefix = (child.prefix || '').toLowerCase();
    if (
      local === 'encoded' &&
      (prefix === 'content' || ns.includes('purl.org/rss/1.0/modules/content'))
    ) {
      fullCandidates.push(child.textContent?.trim() ?? '');
    }
  }
  fullCandidates.push(
    childTextByLocalNames(item, ['content']),
    textOf(item, 'content'),
  );
  // 正文优先完整 content；没有时才回退到摘要字段
  let best = '';
  for (const candidate of fullCandidates) {
    const text = candidate.trim();
    if (!text) continue;
    if (text.length > best.length) best = text;
  }
  if (!best) best = pickEntryDescription(item);
  const mediaHtml = pickEntryMediaHtml(item);
  if (mediaHtml && !/<img\b/i.test(best)) {
    return `${mediaHtml}${best}`;
  }
  return best;
}

function pickEntryMediaHtml(item: Element): string {
  const images: string[] = [];
  const push = (url: string | null | undefined) => {
    const src = url?.trim();
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (images.includes(src)) return;
    images.push(src);
  };
  for (const child of Array.from(item.children)) {
    const local = child.localName.toLowerCase();
    if (local === 'thumbnail' || local === 'content') {
      push(child.getAttribute('url') || child.getAttribute('href'));
    }
    if (local === 'enclosure') {
      const type = (child.getAttribute('type') || '').toLowerCase();
      if (type.startsWith('image/') || !type) {
        push(child.getAttribute('url'));
      }
    }
  }
  return images.map((src) => `<p><img src="${src}" alt="" /></p>`).join('');
}

function pickEntryAuthor(item: Element): string {
  return (
    textOf(item, 'author > name') ||
    textOf(item, 'author') ||
    childTextByLocalNames(item, ['creator']) ||
    ''
  );
}

function assertFeedPayload(xml: string): void {
  const head = xml.slice(0, 4000).toLowerCase();
  if (
    head.includes('just a moment') ||
    head.includes('cf-browser-verification') ||
    head.includes('cdn-cgi/challenge')
  ) {
    throw new Error('订阅源仍被 Cloudflare 拦截，请完成验证后重试');
  }
  if (!head.includes('<rss') && !head.includes('<feed') && !head.includes('<?xml')) {
    throw new Error('订阅源返回内容不是有效 RSS/Atom');
  }
}

function parseDate(input: string): number | null {
  if (!input) return null;
  const raw = input.trim();
  let ms = Date.parse(raw);
  if (!Number.isNaN(ms)) return ms;

  // 常见非标准：2026-07-30 10:00:00 +0800 / 20260730
  const normalized = raw
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  ms = Date.parse(normalized);
  if (!Number.isNaN(ms)) return ms;
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  return null;
}

function pickEntryPublishedAt(item: Element): number | null {
  return (
    parseDate(textOf(item, 'pubDate')) ||
    parseDate(textOf(item, 'published')) ||
    parseDate(textOf(item, 'updated')) ||
    parseDate(childTextByLocalNames(item, ['date', 'pubDate', 'published', 'updated']))
  );
}

function parseFeedXml(xml: string): {
  title: string;
  siteUrl: string | null;
  description: string | null;
  entries: SubscribeFeedItem[];
} {
  assertFeedPayload(xml);
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
      author: pickEntryAuthor(item),
      publishedAt: pickEntryPublishedAt(item),
      description: pickEntryDescription(item),
      content: pickEntryContent(item),
    });
  }

  return { title: title || '未命名订阅源', siteUrl, description, entries };
}

async function fetchFeed(
  url: string,
  title?: string,
  interactiveCf = true,
): Promise<string> {
  return fetchSubscribeFeedXml(url, { title, interactiveCf });
}

export async function createSubscribeSource(input: {
  title: string;
  url: string;
  type?: SubSourceRow['type'];
  category?: string;
}): Promise<string> {
  const url = input.url.trim();
  const existing = await getSubSourceByUrl(url);
  if (existing) {
    await upsertSubSource({
      ...existing,
      title: input.title.trim() || existing.title || url,
      type: input.type ?? existing.type,
      category:
        input.category !== undefined ? input.category.trim() : existing.category,
      enabled: true,
    });
    return existing.id;
  }
  const id = createId('subsrc', `${url}|${input.title}`);
  await upsertSubSource({
    id,
    url,
    title: input.title.trim() || url,
    type: input.type ?? 'rss',
    category: (input.category ?? '').trim(),
    enabled: true,
    metaJson: '{}',
  });
  return id;
}

export async function updateSubscribeSource(
  sourceId: string,
  patch: { title?: string; category?: string },
): Promise<void> {
  await updateSubSourceMeta(sourceId, patch);
}

export async function importSubscribeOpml(xml: string): Promise<{
  imported: number;
  skipped: number;
  sourceIds: string[];
}> {
  const outlines = parseOpml(xml);
  let imported = 0;
  let skipped = 0;
  const sourceIds: string[] = [];
  for (const item of outlines) {
    const before = await getSubSourceByUrl(item.xmlUrl);
    const id = await createSubscribeSource({
      title: item.title,
      url: item.xmlUrl,
      type: 'rss',
      category: item.category,
    });
    sourceIds.push(id);
    if (before) skipped += 1;
    else imported += 1;
  }
  return { imported, skipped, sourceIds };
}

export async function exportSubscribeOpml(): Promise<string> {
  const sources = await listSubSources();
  const feeds = await listSubFeeds();
  const siteBySource = new Map<string, string | null>();
  for (const feed of feeds) {
    if (!feed.sourceId || siteBySource.has(feed.sourceId)) continue;
    siteBySource.set(feed.sourceId, feed.siteUrl);
  }
  return buildOpml(
    sources.map((source) => ({
      title: source.title || source.url,
      url: source.url,
      category: source.category,
      siteUrl: siteBySource.get(source.id) ?? null,
    })),
  );
}

export async function refreshSubscribeSource(
  sourceId: string,
  options?: { interactiveCf?: boolean },
): Promise<number> {
  const source = (await listSubSources()).find((item) => item.id === sourceId);
  if (!source) throw new Error('订阅源不存在');
  const xml = await fetchFeed(source.url, source.title, options?.interactiveCf !== false);
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
  for (const [feedPosition, item] of parsed.entries.entries()) {
    // 优先用 url 生成稳定 id，避免源站 GUID 抖动导致重复/旧内容占位
    const entryId = createId('subentry', `${feedId}|${item.link || item.id}`);
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
      metaJson: JSON.stringify({
        feedPosition,
        description: item.description || undefined,
      } satisfies SubscribeEntryMeta),
      createdAt: now,
    });
    count += 1;
  }
  await touchSubSourceFetchTime(sourceId, now);
  return count;
}

export async function refreshAllSubscribeSources(): Promise<{
  refreshed: number;
  entries: number;
  failures: Array<{ sourceId: string; message: string }>;
}> {
  const sources = (await listSubSources(true)).filter((source) => source.enabled);
  let refreshed = 0;
  let entries = 0;
  const failures: Array<{ sourceId: string; message: string }> = [];
  // 限制并发，避免逐源排队过慢，同时避免同时触发大量 CF 请求
  const concurrency = 3;
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((source) => refreshSubscribeSource(source.id, { interactiveCf: false })),
    );
    results.forEach((result, index) => {
      const source = batch[index]!;
      if (result.status === 'fulfilled') {
        entries += result.value;
        refreshed += 1;
        return;
      }
      failures.push({
        sourceId: source.id,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  }
  return { refreshed, entries, failures };
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
  timeline?: SubscribeTimelineKind;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  query?: string;
  cursor?: SubEntryCursor;
  pageSize?: number;
}): Promise<{
  sources: SubSourceRow[];
  feeds: SubFeedRow[];
  entries: SubEntryRow[];
  unreadBySource: Record<string, number>;
  nextCursor: SubEntryCursor | null;
  hasMore: boolean;
}> {
  const sources = await listSubSources();
  const allFeeds = await listSubFeeds();
  const feeds = options?.sourceId
    ? allFeeds.filter((feed) => feed.sourceId === options.sourceId)
    : allFeeds;
  const feedIds = feeds.map((f) => f.id);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? (options?.sourceId ? 20 : 40)));
  const pageRows =
    options?.sourceId && feedIds.length === 0
      ? []
      : await listSubEntries({
          feedIds: options?.sourceId ? feedIds : undefined,
          unreadOnly: options?.timeline === 'unread' || options?.unreadOnly,
          starredOnly: options?.timeline === 'starred' || options?.starredOnly,
          publishedAfter:
            options?.timeline === 'today'
              ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
              : undefined,
          query: options?.query,
          before: options?.cursor,
          limit: pageSize + 1,
        });
  const hasMore = pageRows.length > pageSize;
  const page = hasMore ? pageRows.slice(0, pageSize) : pageRows;
  const last = page.length ? page[page.length - 1] : undefined;
  const nextCursor = hasMore && last
    ? {
        sortTime: last.publishedAt ?? last.createdAt,
        createdAt: last.createdAt,
        id: last.id,
      }
    : null;
  // 同发布时间用 feedPosition 决胜，更接近源站/Folo 列表观感
  const entries = sortEntriesLikeFolo(page);

  const unreadByFeed = await countUnreadByFeed();
  const unreadBySource: Record<string, number> = {};
  for (const feed of allFeeds) {
    if (!feed.sourceId) continue;
    unreadBySource[feed.sourceId] =
      (unreadBySource[feed.sourceId] ?? 0) + (unreadByFeed.get(feed.id) ?? 0);
  }
  return { sources, feeds, entries, unreadBySource, nextCursor, hasMore };
}

export async function getSubscribeEntry(entryId: string): Promise<SubEntryRow | null> {
  return getSubEntry(entryId);
}

export async function markSubscribeTimelineRead(sourceId?: string): Promise<void> {
  if (!sourceId) {
    await markAllSubEntriesRead();
    return;
  }
  const feeds = await listSubFeeds(sourceId);
  await markAllSubEntriesRead(feeds.map((feed) => feed.id));
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
