import {
  countUnreadByFeed,
  deleteSubEntriesByFeed,
  deleteSubFeed,
  deleteSubSource,
  getSubEntry,
  getSubSource,
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
import { fetchFoloEntryHistory, fetchFoloFeedByUrl, type FoloCloudEntryListItem } from '@/lib/subscribe/folo-cloud';
import { bumpSubscribeFeedDataRevision } from '@/lib/subscribe/feed-data-revision';
import { getSubscribeFoloAuth } from '@/lib/persistence/domains/subscribe-folo-auth';
import { getSubscribeConfig } from '@/lib/persistence/domains/subscribe-config';
import {
  normalizeSubscribeFeedView,
  subscribeFeedViewKindToNumber,
  type SubscribeFeedViewKind,
} from '@/lib/subscribe/feed-view';

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
  foloEntryId?: string;
  /** 入库来源：本地 RSS 或 Folo 云补历史 */
  source?: 'rss' | 'folo-cloud';
};

export type RefreshSubscribeSourceResult = {
  count: number;
  /** RSS 失败但本地已有缓存时的软降级提示 */
  warning?: string;
};

export type SubscribeSourceMeta = {
  foloFeedId?: string;
  sourceType?: string;
  historyCursor?: string | null;
  historyExhausted?: boolean;
  /** 站点主页（用于图标与相对链接） */
  siteUrl?: string | null;
  /** 订阅源图标 URL */
  iconUrl?: string | null;
};

export type SubscribeTimelineKind = 'all' | 'today' | 'unread' | 'starred';
export type { SubscribeFeedViewKind };

/** 进入源自动刷新默认冷却（与配置默认间隔一致）；页面应优先读配置 */
export const AUTO_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

function createId(prefix: string, seed: string): string {
  if (!seed) return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function parseSourceMeta(metaJson: string | null | undefined): SubscribeSourceMeta {
  try {
    const raw = JSON.parse(metaJson || '{}') as SubscribeSourceMeta;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function mergeSourceMeta(
  metaJson: string | null | undefined,
  patch: SubscribeSourceMeta,
): string {
  return JSON.stringify({
    ...parseSourceMeta(metaJson),
    ...patch,
  });
}

function toEpochMs(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const ms = Date.parse(input);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

async function upsertCloudEntries(
  localFeedId: string,
  items: FoloCloudEntryListItem[],
  startPosition = 0,
): Promise<number> {
  let count = 0;
  for (const [index, item] of items.entries()) {
    const entry = item.entries;
    if (!entry?.id) continue;
    const url = entry.url?.trim() || null;
    const entryId = createId('subentry', `${localFeedId}|${url || entry.id}`);
    await upsertSubEntry({
      id: entryId,
      feedId: localFeedId,
      title: String(entry.title ?? '').trim() || '无标题',
      url,
      author: entry.author?.trim() || null,
      publishedAt: toEpochMs(entry.publishedAt ?? entry.insertedAt),
      read: item.read === true,
      starred: Boolean(item.collections),
      content: entry.content || entry.description || null,
      metaJson: JSON.stringify({
        feedPosition: startPosition + index,
        description: entry.description || undefined,
        foloEntryId: entry.id,
        source: 'folo-cloud',
      } satisfies SubscribeEntryMeta),
    });
    count += 1;
  }
  return count;
}

async function resolveFoloFeedIdForSource(source: SubSourceRow): Promise<string> {
  const meta = parseSourceMeta(source.metaJson);
  if (meta.foloFeedId?.trim()) return meta.foloFeedId.trim();
  const lookup = await fetchFoloFeedByUrl(source.url);
  const feedId = String(lookup?.feed?.id ?? '').trim();
  if (feedId) {
    await upsertSubSource({
      ...source,
      metaJson: mergeSourceMeta(source.metaJson, { foloFeedId: feedId }),
    });
  }
  return feedId;
}

/**
 * 用 Folo 云 API 向后补齐更早历史（实验功能）。
 * 仅在实验开关开启且已登录时生效；由滚到底调用，不参与日常刷新新鲜度。
 */
export async function pullSubscribeHistoryFromCloud(
  sourceId: string,
  options?: { pages?: number; pageSize?: number; continueFromCursor?: boolean },
): Promise<{ imported: number; exhausted: boolean; nextCursor: string | null }> {
  const source = await getSubSource(sourceId);
  if (!source) throw new Error('订阅源不存在');
  const config = await getSubscribeConfig();
  if (!config.foloCloudAccountEnabled) {
    return { imported: 0, exhausted: false, nextCursor: null };
  }
  const auth = await getSubscribeFoloAuth();
  if (!auth.sessionToken) {
    return { imported: 0, exhausted: false, nextCursor: null };
  }
  const foloFeedId = await resolveFoloFeedIdForSource(source);
  if (!foloFeedId) {
    return { imported: 0, exhausted: true, nextCursor: null };
  }

  const localFeedId = createId('subfeed', `${sourceId}|${source.url}`);
  const existingFeeds = await listSubFeeds(sourceId);
  let feed = existingFeeds.find((item) => item.id === localFeedId) ?? existingFeeds[0];
  if (!feed) {
    await upsertSubFeed({
      id: localFeedId,
      sourceId,
      feedUrl: source.url,
      title: source.title,
      siteUrl: null,
      description: null,
      metaJson: JSON.stringify({ foloFeedId, sourceType: source.type }),
    });
    feed = (await listSubFeeds(sourceId)).find((item) => item.id === localFeedId)!;
  } else {
    await upsertSubFeed({
      ...feed,
      metaJson: mergeSourceMeta(feed.metaJson, { foloFeedId }),
    });
  }

  const meta = parseSourceMeta(source.metaJson);
  if (options?.continueFromCursor && meta.historyExhausted) {
    return {
      imported: 0,
      exhausted: true,
      nextCursor: meta.historyCursor || null,
    };
  }
  let cursor =
    options?.continueFromCursor === false ? null : meta.historyCursor || null;
  const pages = Math.max(1, Math.min(30, options?.pages ?? 8));
  const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 40));
  let imported = 0;
  let exhausted = false;
  let nextCursor: string | null = cursor;

  for (let page = 0; page < pages; page++) {
    const batch = await fetchFoloEntryHistory({
      sessionToken: auth.sessionToken,
      feedId: foloFeedId,
      limit: pageSize,
      publishedAfter: nextCursor || undefined,
      withContent: true,
    });
    imported += await upsertCloudEntries(feed.id, batch.entries, page * pageSize);
    nextCursor = batch.nextCursor;
    if (!batch.hasMore) {
      exhausted = true;
      break;
    }
  }

  await upsertSubSource({
    ...source,
    metaJson: mergeSourceMeta(source.metaJson, {
      foloFeedId,
      historyCursor: nextCursor,
      historyExhausted: exhausted,
    }),
  });
  return { imported, exhausted, nextCursor };
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

function pickFeedIconUrl(root: Element, siteUrl: string | null, feedUrl: string): string | null {
  const candidates = [
    root.querySelector('image > url')?.textContent?.trim(),
    root.querySelector('image')?.getAttribute('href')?.trim(),
    root.querySelector('icon')?.textContent?.trim(),
    root.querySelector('logo')?.textContent?.trim(),
    (() => {
      for (const child of Array.from(root.children ?? [])) {
        const local = child.localName.toLowerCase();
        if (local === 'image') {
          return (
            child.querySelector('url')?.textContent?.trim() ||
            child.getAttribute('href') ||
            child.getAttribute('url') ||
            ''
          );
        }
        if (local === 'icon' || local === 'logo') {
          return child.textContent?.trim() || child.getAttribute('href') || '';
        }
      }
      return '';
    })(),
  ];
  for (const raw of candidates) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('//')) return `https:${value}`;
    const base = siteUrl || feedUrl;
    if (!base) continue;
    try {
      const normalized = /^https?:\/\//i.test(base)
        ? base
        : /^rsshub:\/\//i.test(base)
          ? `https://rsshub.app/${base.replace(/^rsshub:\/\//i, '')}`
          : `https://${base}`;
      return new URL(value, normalized).toString();
    } catch {
      /* ignore */
    }
  }
  return null;
}

function defaultSourceIconUrl(siteUrl: string | null | undefined, feedUrl: string): string | null {
  const seed = String(siteUrl || feedUrl || '').trim();
  if (!seed) return null;
  try {
    const normalized = /^https?:\/\//i.test(seed)
      ? seed
      : /^rsshub:\/\//i.test(seed)
        ? `https://rsshub.app/${seed.replace(/^rsshub:\/\//i, '')}`
        : `https://${seed}`;
    const host = new URL(normalized).host;
    return host ? `https://icons.folo.is/${host}` : null;
  } catch {
    return null;
  }
}

function parseFeedXml(
  xml: string,
  feedUrl = '',
): {
  title: string;
  siteUrl: string | null;
  description: string | null;
  iconUrl: string | null;
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
  const iconUrl =
    pickFeedIconUrl(root, siteUrl, feedUrl) || defaultSourceIconUrl(siteUrl, feedUrl);

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

  return { title: title || '未命名订阅源', siteUrl, description, iconUrl, entries };
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
  /** Folo view 0–5；缺省保留已有或文章 */
  view?: number;
  foloFeedId?: string;
  siteUrl?: string | null;
  iconUrl?: string | null;
}): Promise<string> {
  const url = input.url.trim();
  const existing = await getSubSourceByUrl(url);
  const metaPatch: SubscribeSourceMeta = {};
  if (input.foloFeedId?.trim()) metaPatch.foloFeedId = input.foloFeedId.trim();
  const siteUrl = input.siteUrl?.trim() || null;
  const iconUrl =
    input.iconUrl?.trim() || defaultSourceIconUrl(siteUrl, url) || null;
  if (siteUrl) metaPatch.siteUrl = siteUrl;
  if (iconUrl) metaPatch.iconUrl = iconUrl;
  const nextView =
    input.view !== undefined
      ? normalizeSubscribeFeedView(input.view)
      : existing
        ? existing.view
        : 0;
  if (existing) {
    await upsertSubSource({
      ...existing,
      title: input.title.trim() || existing.title || url,
      type: input.type ?? existing.type,
      category:
        input.category !== undefined ? input.category.trim() : existing.category,
      view: nextView,
      enabled: true,
      metaJson: Object.keys(metaPatch).length
        ? mergeSourceMeta(existing.metaJson, metaPatch)
        : existing.metaJson,
    });
    bumpSubscribeFeedDataRevision();
    return existing.id;
  }
  const id = createId('subsrc', `${url}|${input.title}`);
  await upsertSubSource({
    id,
    url,
    title: input.title.trim() || url,
    type: input.type ?? 'rss',
    category: (input.category ?? '').trim(),
    view: nextView,
    enabled: true,
    metaJson: Object.keys(metaPatch).length ? JSON.stringify(metaPatch) : '{}',
  });
  bumpSubscribeFeedDataRevision();
  return id;
}

export async function updateSubscribeSource(
  sourceId: string,
  patch: { title?: string; category?: string; view?: number },
): Promise<void> {
  await updateSubSourceMeta(sourceId, patch);
  bumpSubscribeFeedDataRevision();
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

/**
 * 仅本地 RSS 刷新（保新鲜度）。云端历史由滚到底的 pullSubscribeHistoryFromCloud 补齐。
 */
export async function refreshSubscribeSource(
  sourceId: string,
  options?: { interactiveCf?: boolean; silent?: boolean },
): Promise<RefreshSubscribeSourceResult> {
  const source = (await listSubSources()).find((item) => item.id === sourceId);
  if (!source) throw new Error('订阅源不存在');
  const feedId = createId('subfeed', `${sourceId}|${source.url}`);
  let count = 0;

  try {
    const xml = await fetchFeed(source.url, source.title, options?.interactiveCf !== false);
    const parsed = parseFeedXml(xml, source.url);
    const sourceMeta = parseSourceMeta(source.metaJson);
    const siteUrl = parsed.siteUrl || sourceMeta.siteUrl || null;
    const iconUrl =
      parsed.iconUrl || sourceMeta.iconUrl || defaultSourceIconUrl(siteUrl, source.url);
    await upsertSubSource({
      ...source,
      title: parsed.title || source.title,
      metaJson: mergeSourceMeta(source.metaJson, {
        foloFeedId: sourceMeta.foloFeedId,
        sourceType: source.type,
        siteUrl,
        iconUrl,
      }),
    });
    await upsertSubFeed({
      id: feedId,
      sourceId,
      feedUrl: source.url,
      title: parsed.title || source.title,
      siteUrl: parsed.siteUrl,
      description: parsed.description,
      metaJson: JSON.stringify({
        sourceType: source.type,
        foloFeedId: sourceMeta.foloFeedId,
        iconUrl,
      }),
    });
    const now = Date.now();
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
          source: 'rss',
        } satisfies SubscribeEntryMeta),
        createdAt: now,
      });
      count += 1;
    }
  } catch (error) {
    const rssError = error instanceof Error ? error : new Error(String(error));
    const existing = await listSubEntries({ feedIds: [feedId], limit: 1 });
    if (existing.length > 0) {
      return {
        count: 0,
        warning: `最新刷新失败，仍显示本地缓存：${rssError.message}`,
      };
    }
    throw rssError;
  }

  await touchSubSourceFetchTime(sourceId, Date.now());
  if (!options?.silent) bumpSubscribeFeedDataRevision();
  return { count };
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
      batch.map((source) =>
        refreshSubscribeSource(source.id, { interactiveCf: false, silent: true }),
      ),
    );
    results.forEach((result, index) => {
      const source = batch[index]!;
      if (result.status === 'fulfilled') {
        entries += result.value.count;
        refreshed += 1;
        return;
      }
      failures.push({
        sourceId: source.id,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  }
  bumpSubscribeFeedDataRevision();
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
  /** FeedView：all 不过滤；其余按 sub_sources.view */
  feedView?: SubscribeFeedViewKind;
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
  const viewFilter = subscribeFeedViewKindToNumber(options?.feedView);
  const viewSourceIds =
    viewFilter == null
      ? null
      : new Set(sources.filter((s) => s.view === viewFilter).map((s) => s.id));
  const allFeeds = await listSubFeeds();
  let feeds = options?.sourceId
    ? allFeeds.filter((feed) => feed.sourceId === options.sourceId)
    : allFeeds;
  if (viewSourceIds) {
    feeds = feeds.filter(
      (feed) => feed.sourceId != null && viewSourceIds.has(feed.sourceId),
    );
  }
  const feedIds = feeds.map((f) => f.id);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? (options?.sourceId ? 20 : 40)));
  const scopedByViewOrSource = Boolean(options?.sourceId) || viewFilter != null;
  const pageRows =
    scopedByViewOrSource && feedIds.length === 0
      ? []
      : await listSubEntries({
          feedIds: scopedByViewOrSource ? feedIds : undefined,
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
  bumpSubscribeFeedDataRevision();
}

export async function updateSubscribeSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  await setSubSourceEnabled(sourceId, enabled);
  bumpSubscribeFeedDataRevision();
}

export async function updateSubscribeEntryRead(entryId: string, read: boolean): Promise<void> {
  await markSubEntryRead(entryId, read);
}

export async function updateSubscribeEntryStarred(entryId: string, starred: boolean): Promise<void> {
  await markSubEntryStarred(entryId, starred);
}
