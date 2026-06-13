/**
 * RSS 文章 Web API（列表 / 刷新 / 阅读）
 */

import * as rssArticlesDb from '@/lib/database/rss-articles';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import {
  deleteRssReadRecord,
  getAllRssReadRecords,
  getRssReadRecordsByOrigin,
  upsertRssReadRecord,
} from '@/lib/database/rss-read-records';
import * as rssStarsDb from '@/lib/database/rss-stars';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import { refreshRssArticlesForSource } from '@/lib/rss-source/refresh-articles';
import { prepareRssReadSession } from '@/lib/rss-source/rss-read-session';
import { proxyRssUrlPage } from '@/lib/web-api/rss-page-proxy';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import { queryParam } from '@/lib/web-api/query';
import type { RssArticle, RssReadRecord, RssStar } from '@/types';

export interface RssSortEntry {
  name: string;
  url: string;
}

export interface RssArticlesRefreshResult {
  count: number;
  sort: string;
  articles: RssArticle[];
}

export interface RssReadApiPayload {
  mode: 'content' | 'url' | 'startHtml' | 'proxy';
  title: string;
  html?: string;
  directUrl?: string;
  pageUrl: string;
  article?: RssArticle;
  starred?: boolean;
}

function resolveOrigin(query: Record<string, string> | undefined): string | undefined {
  return queryParam(query, 'origin') ?? queryParam(query, 'url');
}

function syntheticArticle(origin: string, link: string, title?: string): RssArticle {
  return {
    origin,
    link,
    sort: '',
    title: title ?? link,
    order: 0,
    group: '默认分组',
    read: false,
    type: 0,
    durPos: 0,
  };
}

export async function getRssSortsApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssSortEntry[]>> {
  const origin = resolveOrigin(query);
  if (!origin) return legadoErr('缺少 url');
  const source = await rssSourcesDb.getRssSource(origin);
  if (!source) return legadoErr('未找到源');
  const sorts = await parseSortUrls(source);
  return legadoOk(sorts);
}

export async function getRssArticlesApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssArticle[]>> {
  const origin = resolveOrigin(query);
  if (!origin) return legadoErr('缺少 origin');
  const sort = queryParam(query, 'sort') ?? '';
  const articles = await rssArticlesDb.getRssArticlesByOriginAndSort(origin, sort);
  return legadoOk(articles);
}

export async function refreshRssArticlesApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssArticlesRefreshResult>> {
  const origin = resolveOrigin(query);
  if (!origin) return legadoErr('缺少 origin');
  const sortName = queryParam(query, 'sort');
  const page = Math.max(1, Number(queryParam(query, 'page') ?? '1') || 1);

  const source = await rssSourcesDb.getRssSource(origin);
  if (!source) return legadoErr('未找到源');

  const count = await refreshRssArticlesForSource(source, sortName, page);
  const sorts = await parseSortUrls(source);
  const resolvedSort =
    sortName && sorts.some((s) => s.name === sortName)
      ? sortName
      : (sorts.find((s) => s.name === sortName)?.name ?? sorts[0]?.name ?? '');
  const articles = await rssArticlesDb.getRssArticlesByOriginAndSort(origin, resolvedSort);

  return legadoOk({ count, sort: resolvedSort, articles });
}

export async function getRssArticleReadApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssReadApiPayload>> {
  const origin = resolveOrigin(query);
  if (!origin) return legadoErr('缺少 origin');

  const source = await rssSourcesDb.getRssSource(origin);
  if (!source) return legadoErr('未找到源');

  const link = queryParam(query, 'link');
  const useStartHtml = queryParam(query, 'start') === '1' || queryParam(query, 'startHtml') === '1';
  const openUrl = queryParam(query, 'openUrl');

  let article: RssArticle | null = null;
  if (link) {
    article = await rssArticlesDb.getRssArticle(origin, link);
    if (!article) {
      article = syntheticArticle(origin, link, queryParam(query, 'title'));
    }
  }

  if (!article && !useStartHtml && !openUrl) {
    return legadoErr('缺少 link 或 start 参数');
  }

  const session = await prepareRssReadSession({
    source,
    article: article ?? undefined,
    openUrl,
    useStartHtml,
  });

  let starred = false;
  if (article?.link) {
    starred = !!(await rssStarsDb.getRssStar(origin, article.link));
    await upsertRssReadRecord({
      record: article.link,
      origin: article.origin,
      sort: article.sort,
      title: session.title,
      readTime: Date.now(),
      read: true,
      image: article.image,
      type: article.type,
      durPos: article.durPos,
      pubDate: article.pubDate,
    });
  }

  const useProxy =
    queryParam(query, 'proxy') !== '0' &&
    (session.mode === 'url' || queryParam(query, 'proxy') === '1');

  if (useProxy && session.directUrl?.startsWith('http')) {
    try {
      const proxied = await proxyRssUrlPage(source, session.directUrl);
      return legadoOk({
        mode: 'proxy',
        title: session.title,
        html: proxied.html,
        directUrl: session.directUrl,
        pageUrl: proxied.finalUrl,
        article: article ?? undefined,
        starred,
      });
    } catch (e) {
      console.warn('[rss-article] url 代理失败，回退直链', e);
    }
  }

  return legadoOk({
    mode: session.mode,
    title: session.title,
    html: session.html,
    directUrl: session.directUrl,
    pageUrl: session.pageUrl,
    article: article ?? undefined,
    starred,
  });
}

export async function clearRssArticlesApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<string>> {
  const origin = resolveOrigin(query);
  if (!origin) return legadoErr('缺少 origin');
  const sort = queryParam(query, 'sort');
  if (sort != null) {
    await rssArticlesDb.deleteRssArticlesByOriginAndSort(origin, sort);
  } else {
    await rssArticlesDb.deleteRssArticlesByOrigin(origin);
  }
  return legadoOk('已清除');
}

export async function getRssReadRecordsApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssReadRecord[]>> {
  const origin = resolveOrigin(query);
  const records = origin
    ? await getRssReadRecordsByOrigin(origin)
    : await getAllRssReadRecords();
  return legadoOk(records);
}

export async function deleteRssReadRecordApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  let record = '';
  try {
    const parsed = JSON.parse(postData ?? '{}') as { record?: string };
    record = parsed.record?.trim() ?? '';
  } catch {
    return legadoErr('格式不对');
  }
  if (!record) return legadoErr('缺少 record');
  await deleteRssReadRecord(record);
  return legadoOk('已删除');
}

export async function getRssStarsApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<RssStar[]>> {
  const origin = resolveOrigin(query);
  if (origin) {
    const stars = await rssStarsDb.getAllRssStars();
    return legadoOk(stars.filter((s) => s.origin === origin));
  }
  return legadoOk(await rssStarsDb.getAllRssStars());
}

function parseRssStarPayload(raw: string | null): RssStar | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RssStar>;
    const origin = parsed.origin?.trim();
    const link = parsed.link?.trim();
    const title = parsed.title?.trim();
    if (!origin || !link || !title) return null;
    return {
      origin,
      link,
      title,
      sort: parsed.sort?.trim() ?? '',
      starTime: parsed.starTime ?? Date.now(),
      pubDate: parsed.pubDate,
      description: parsed.description,
      content: parsed.content,
      image: parsed.image,
      group: parsed.group?.trim() || '默认分组',
      variable: parsed.variable,
      type: parsed.type ?? 0,
      durPos: parsed.durPos ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveRssStarApi(
  postData: string | null,
): Promise<LegadoReturnData<null>> {
  const star = parseRssStarPayload(postData);
  if (!star) return legadoErr('格式不对');
  await rssStarsDb.insertRssStar(star);
  return legadoOk(null);
}

export async function deleteRssStarApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  let origin = '';
  let link = '';
  try {
    const parsed = JSON.parse(postData ?? '{}') as { origin?: string; link?: string };
    origin = parsed.origin?.trim() ?? '';
    link = parsed.link?.trim() ?? '';
  } catch {
    return legadoErr('格式不对');
  }
  if (!origin || !link) return legadoErr('缺少 origin 或 link');
  await rssStarsDb.deleteRssStar(origin, link);
  return legadoOk('已取消收藏');
}
