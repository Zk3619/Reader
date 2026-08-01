/**
 * Folo 云公开 API（免登录发现）
 * 基址：https://api.folo.is
 */

import { getJson, request } from '@/lib/http';

export const FOLO_API_BASE_URL = 'https://api.folo.is';

export type FoloTrendingLanguage = 'eng' | 'cmn';
export type FoloTrendingRange = '1d' | '3d' | '7d' | '30d';

/**
 * 主程序界面语言 → Folo trending/discover 语言参数。
 * zh* → cmn；en* → eng；其余不传（全部语言）。
 */
export function appLanguageToFoloTrendingLanguage(
  language: string | undefined | null,
): FoloTrendingLanguage | 'all' {
  const lang = String(language ?? '').trim().toLowerCase();
  if (lang.startsWith('zh')) return 'cmn';
  if (lang.startsWith('en')) return 'eng';
  return 'all';
}

/**
 * 对齐 Folo 发现分类页 LanguageMap：
 * trending 的 cmn/eng → RSSHub discover 的 zh-CN / en。
 * 传错 lang（如 cmn）时 API 会返回空 data。
 */
export function appLanguageToFoloRsshubLang(
  language: string | undefined | null,
): string | undefined {
  const trending = appLanguageToFoloTrendingLanguage(language);
  if (trending === 'cmn') return 'zh-CN';
  if (trending === 'eng') return 'en';
  return undefined;
}

export const FOLO_RSSHUB_CATEGORIES = [
  'all',
  'social-media',
  'new-media',
  'traditional-media',
  'bbs',
  'blog',
  'programming',
  'design',
  'live',
  'multimedia',
  'picture',
  'anime',
  'program-update',
  'shopping',
  'game',
  'reading',
  'journal',
  'finance',
] as const;

export type FoloRsshubCategory = (typeof FOLO_RSSHUB_CATEGORIES)[number];

export const FOLO_RSSHUB_CATEGORY_LABELS: Record<FoloRsshubCategory, string> = {
  all: '全部',
  'social-media': '社交媒体',
  'new-media': '新媒体',
  'traditional-media': '传统媒体',
  bbs: '论坛',
  blog: '博客',
  programming: '编程',
  design: '设计',
  live: '直播',
  multimedia: '音视频',
  picture: '图片',
  anime: '二次元',
  'program-update': '程序更新',
  shopping: '购物',
  game: '游戏',
  reading: '阅读',
  journal: '科学期刊',
  finance: '金融',
};

interface FoloApiEnvelope<T> {
  code?: number;
  data?: T;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 兼容两类成功响应：
 * - `{ code: 0, data }`（trending / feeds）
 * - `{ data }` 且无 code（部分 discover/rsshub）
 */
export function unwrapFoloEnvelope<T>(payload: unknown): T {
  if (payload == null) throw new Error('Folo API 响应无效');
  if (!isRecord(payload)) {
    // 少数端点可能直接返回裸数据
    return payload as T;
  }
  if ('code' in payload) {
    const code = payload.code;
    if (code !== 0 && code !== '0') {
      throw new Error(
        (typeof payload.message === 'string' && payload.message) ||
          `Folo API 错误 (${String(code)})`,
      );
    }
  }
  if ('data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

export interface FoloTrendingFeed {
  type?: string;
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  image: string | null;
  /** 部分接口会带回 FeedView 0–5 */
  view?: number | null;
}

export interface FoloTrendingAnalytics {
  feedId: string;
  updatesPerWeek?: number;
  subscriptionCount?: number;
  boostPoints?: number;
}

export interface FoloTrendingItem {
  feedId: string;
  view: number | null;
  feed: FoloTrendingFeed;
  analytics: FoloTrendingAnalytics;
}

export interface FoloRsshubRoute {
  /** RSSHub 路由可能声明为 string 或 string[]（多 path 共用 handler） */
  path: string | string[];
  categories: string[];
  example: string;
  parameters?: Record<string, string>;
  name: string;
  maintainers?: string[];
  description?: string;
}

export interface FoloRsshubNamespace {
  name: string;
  url: string;
  description?: string;
  lang?: string;
  routes: Record<string, FoloRsshubRoute>;
}

export type FoloRsshubIndex = Record<string, FoloRsshubNamespace>;

export interface FoloRsshubTopFeed {
  type?: string;
  id: string;
  url: string;
  title: string | null;
  description?: string | null;
  siteUrl?: string | null;
  image?: string | null;
}

export interface FoloRsshubRouteAnalytics {
  subscriptionCount: number;
  topFeeds?: FoloRsshubTopFeed[];
}

export type FoloRsshubAnalyticsIndex = Record<string, FoloRsshubRouteAnalytics>;

/** 热度数字展示（对齐 Folo formatNumber 简版） */
export function formatFoloHeatCount(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

/**
 * 对齐 Folo 发现页：path 为数组时优先取与 map key 相同的项，否则取首个字符串。
 */
export function normalizeFoloRsshubRoutePath(
  path: string | string[] | null | undefined,
  preferredKey?: string,
): string {
  if (Array.isArray(path)) {
    const preferred =
      preferredKey && path.find((p) => typeof p === 'string' && p === preferredKey);
    if (preferred) return preferred;
    const first = path.find((p) => typeof p === 'string' && p.trim());
    return first?.trim() || String(preferredKey ?? '').trim();
  }
  const single = String(path ?? '').trim();
  return single || String(preferredKey ?? '').trim();
}

/** 带命名空间前缀的分析统计 key，如 `/github/issue/:user/:repo` */
export function foloRsshubAnalyticsKey(
  namespace: string,
  path: string | string[] | null | undefined,
  preferredKey?: string,
): string {
  const raw = normalizeFoloRsshubRoutePath(path, preferredKey);
  if (!raw) return `/${namespace}`;
  const suffix = raw.startsWith('/') ? raw : `/${raw}`;
  return `/${namespace}${suffix}`;
}

function foloUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, FOLO_API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function foloGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const payload = await getJson<FoloApiEnvelope<T>>(foloUrl(path, query), {
    timeout: 30_000,
    headers: {
      Accept: 'application/json',
    },
  });
  return unwrapFoloEnvelope<T>(payload);
}

export interface FoloFeedLookupResult {
  feed: FoloTrendingFeed;
  entries?: Array<{
    id: string;
    title: string | null;
    content?: string | null;
    description?: string | null;
    publishedAt?: string | null;
    url?: string | null;
    author?: string | null;
  }>;
}

/** 免登录：按 URL / id 解析 Folo feed（含少量预览条目） */
export async function fetchFoloFeedByUrl(feedUrl: string): Promise<FoloFeedLookupResult | null> {
  const url = feedUrl.trim();
  if (!url) return null;
  try {
    return await foloGet<FoloFeedLookupResult>('/feeds', { url });
  } catch {
    return null;
  }
}

export async function fetchFoloFeedById(feedId: string): Promise<FoloFeedLookupResult | null> {
  const id = feedId.trim();
  if (!id) return null;
  try {
    return await foloGet<FoloFeedLookupResult>('/feeds', { id });
  } catch {
    return null;
  }
}

export interface FoloCloudEntryPayload {
  id: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  content?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  insertedAt?: string | null;
}

export interface FoloCloudEntryListItem {
  read?: boolean;
  entries: FoloCloudEntryPayload;
  collections?: { createdAt?: string } | null;
}

function foloSessionHeaders(sessionToken: string): Record<string, string> {
  const token = sessionToken.trim();
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    Cookie: `__Secure-better-auth.session_token=${token}; better-auth.session_token=${token}`,
    'Content-Type': 'application/json',
  };
}

/** 需登录：按 feed 拉取历史（POST /entries，对齐官方 CLI） */
export async function fetchFoloEntryHistory(options: {
  sessionToken: string;
  feedId: string;
  limit?: number;
  publishedAfter?: string;
  withContent?: boolean;
}): Promise<{
  entries: FoloCloudEntryListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const feedId = options.feedId.trim();
  if (!feedId) throw new Error('缺少 Folo feedId');
  const limit = Math.max(1, Math.min(100, options.limit ?? 40));
  const response = await request(foloUrl('/entries'), {
    method: 'POST',
    headers: foloSessionHeaders(options.sessionToken),
    body: JSON.stringify({
      feedId,
      limit,
      withContent: options.withContent !== false,
      publishedAfter: options.publishedAfter || undefined,
    }),
    timeout: 60_000,
  });
  const payload = await response.json<unknown>();
  const data = unwrapFoloEnvelope<FoloCloudEntryListItem[]>(payload);
  const entries = Array.isArray(data) ? data : [];
  const last = entries.length ? entries[entries.length - 1] : undefined;
  const nextCursor = last?.entries?.publishedAt ? String(last.entries.publishedAt) : null;
  return {
    entries,
    nextCursor,
    hasMore: Boolean(nextCursor) && entries.length >= limit,
  };
}

export async function fetchFoloTrendingFeeds(options?: {
  language?: FoloTrendingLanguage | 'all';
  range?: FoloTrendingRange;
  limit?: number;
  view?: number;
}): Promise<FoloTrendingItem[]> {
  const language =
    options?.language && options.language !== 'all' ? options.language : undefined;
  return foloGet<FoloTrendingItem[]>('/trending/feeds', {
    language,
    range: options?.range ?? '7d',
    limit: options?.limit ?? 20,
    view: options?.view,
  });
}

export async function fetchFoloRsshubIndex(options?: {
  category?: FoloRsshubCategory | string;
  /** 对齐 Folo LanguageMap 输出：zh-CN / en；勿传 trending 码 cmn/eng */
  lang?: string;
}): Promise<FoloRsshubIndex> {
  const category = options?.category && options.category !== 'all' ? options.category : 'popular';
  let lang = options?.lang?.trim() || undefined;
  if (!lang || lang === 'all') lang = undefined;
  else if (lang === 'cmn') lang = 'zh-CN';
  else if (lang === 'eng') lang = 'en';
  return foloGet<FoloRsshubIndex>('/discover/rsshub', {
    categories: category,
    lang,
  });
}

export async function fetchFoloRsshubAnalytics(): Promise<FoloRsshubAnalyticsIndex> {
  return foloGet<FoloRsshubAnalyticsIndex>('/discover/rsshub-analytics');
}

/** 将 Folo/RSSHub 示例路径转为 Reader 可订阅 URL（rsshub:// 或 https）。 */
export function foloRouteExampleToSubscribeUrl(example: string): string {
  const raw = example.trim();
  if (!raw) throw new Error('路由示例为空');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^rsshub:\/\//i.test(raw)) return raw;
  const path = raw.replace(/^\/+/, '');
  return `rsshub://${path}`;
}

export function foloFeedToSubscribeUrl(feed: Pick<FoloTrendingFeed, 'url'>): string {
  const url = String(feed.url ?? '').trim();
  if (!url) throw new Error('订阅源 URL 为空');
  return url;
}

/** 与 Folo 客户端一致：站点图标走 icons.folo.is */
export function foloSiteIconUrl(siteUrl: string | null | undefined): string {
  const value = String(siteUrl ?? '').trim();
  if (!value) return '';
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const host = new URL(normalized).host;
    return host ? `https://icons.folo.is/${host}` : '';
  } catch {
    return '';
  }
}

export function foloAvatarFallbackUrl(siteUrl: string | null | undefined): string {
  const value = String(siteUrl ?? '').trim();
  if (!value) return '';
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const host = new URL(normalized).hostname.replace(/^www\./i, '');
    const label = (host.split('.')[0] || host).slice(0, 2).toUpperCase() || 'F';
    return `https://avatar.vercel.sh/${encodeURIComponent(host)}.svg?text=${encodeURIComponent(label)}`;
  } catch {
    return '';
  }
}
