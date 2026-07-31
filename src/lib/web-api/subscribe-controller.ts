import {
  createSubscribeSource,
  exportSubscribeOpml,
  getSubscribeEntry,
  importSubscribeOpml,
  listSubscribeDashboard,
  markSubscribeTimelineRead,
  refreshAllSubscribeSources,
  refreshSubscribeSource,
  removeSubscribeSource,
  searchSubscribeEntries,
  updateSubscribeEntryRead,
  updateSubscribeEntryStarred,
  updateSubscribeSource,
  updateSubscribeSourceEnabled,
  type SubscribeTimelineKind,
} from '@/lib/subscribe/service';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import { queryParam } from '@/lib/web-api/query';

function parseBody<T extends object>(raw: string | null): T | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeTimeline(raw: string | undefined): SubscribeTimelineKind | undefined {
  return raw === 'all' || raw === 'today' || raw === 'unread' || raw === 'starred'
    ? raw
    : undefined;
}

function normalizeFeedView(
  raw: string | undefined,
): import('@/lib/subscribe/feed-view').SubscribeFeedViewKind | undefined {
  if (
    raw === 'all' ||
    raw === 'articles' ||
    raw === 'social-media' ||
    raw === 'pictures' ||
    raw === 'videos' ||
    raw === 'audios' ||
    raw === 'notifications'
  ) {
    return raw;
  }
  return undefined;
}

export async function getSubscribeDashboardApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<Awaited<ReturnType<typeof listSubscribeDashboard>>>> {
  const sourceId = queryParam(query, 'sourceId') ?? '';
  const timeline = normalizeTimeline(queryParam(query, 'timeline'));
  const feedView = normalizeFeedView(queryParam(query, 'feedView'));
  const unreadOnly = queryParam(query, 'unreadOnly') === '1';
  const starredOnly = queryParam(query, 'starredOnly') === '1';
  const keyword = queryParam(query, 'q') ?? '';
  const pageSizeRaw = Number(queryParam(query, 'pageSize') ?? '');
  const sortTime = Number(queryParam(query, 'cursorSortTime') ?? '');
  const createdAt = Number(queryParam(query, 'cursorCreatedAt') ?? '');
  const cursorId = queryParam(query, 'cursorId') ?? '';
  const data = await listSubscribeDashboard({
    sourceId: sourceId || undefined,
    feedView,
    timeline,
    unreadOnly,
    starredOnly,
    query: keyword,
    pageSize: Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : undefined,
    cursor:
      Number.isFinite(sortTime) && Number.isFinite(createdAt) && cursorId
        ? { sortTime, createdAt, id: cursorId }
        : undefined,
  });
  return legadoOk(data);
}

/** 时间线别名：与 dashboard 同形，便于 API 对齐 */
export async function getSubscribeTimelineApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<Awaited<ReturnType<typeof listSubscribeDashboard>>>> {
  return getSubscribeDashboardApi(query);
}

export async function getSubscribeEntryApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<NonNullable<Awaited<ReturnType<typeof getSubscribeEntry>>>>> {
  const entryId = queryParam(query, 'entryId') ?? '';
  if (!entryId) return legadoErr('缺少 entryId');
  const entry = await getSubscribeEntry(entryId);
  if (!entry) return legadoErr('条目不存在');
  return legadoOk(entry);
}

export async function createSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<{ id: string }>> {
  const body = parseBody<{
    title?: string;
    url?: string;
    type?: 'opml' | 'rss' | 'atom' | 'json';
    category?: string;
    view?: number;
  }>(postData);
  const url = body?.url?.trim() ?? '';
  if (!url) return legadoErr('缺少 url');
  const id = await createSubscribeSource({
    title: body?.title?.trim() || url,
    url,
    type: body?.type,
    category: body?.category,
    view: body?.view,
  });
  return legadoOk({ id });
}

export async function updateSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{
    sourceId?: string;
    title?: string;
    category?: string;
    view?: number;
  }>(postData);
  const sourceId = body?.sourceId?.trim() ?? '';
  if (!sourceId) return legadoErr('缺少 sourceId');
  await updateSubscribeSource(sourceId, {
    title: body?.title,
    category: body?.category,
    view: body?.view,
  });
  return legadoOk('已更新');
}

export async function refreshSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<{ count: number } | Awaited<ReturnType<typeof refreshAllSubscribeSources>>>> {
  const body = parseBody<{ sourceId?: string; all?: boolean }>(postData);
  if (body?.all || !body?.sourceId?.trim()) {
    if (body?.all) return legadoOk(await refreshAllSubscribeSources());
  }
  const sourceId = body?.sourceId?.trim() ?? '';
  if (!sourceId) return legadoErr('缺少 sourceId');
  const result = await refreshSubscribeSource(sourceId);
  return legadoOk(
    result.warning
      ? { count: result.count, warning: result.warning }
      : { count: result.count },
  );
}

export async function refreshAllSubscribeSourcesApi(): Promise<
  LegadoReturnData<Awaited<ReturnType<typeof refreshAllSubscribeSources>>>
> {
  return legadoOk(await refreshAllSubscribeSources());
}

export async function setSubscribeSourceEnabledApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{ sourceId?: string; enabled?: boolean }>(postData);
  const sourceId = body?.sourceId?.trim() ?? '';
  if (!sourceId) return legadoErr('缺少 sourceId');
  await updateSubscribeSourceEnabled(sourceId, body?.enabled !== false);
  return legadoOk('已更新');
}

export async function deleteSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{ sourceId?: string }>(postData);
  const sourceId = body?.sourceId?.trim() ?? '';
  if (!sourceId) return legadoErr('缺少 sourceId');
  await removeSubscribeSource(sourceId);
  return legadoOk('已删除');
}

export async function markSubscribeEntryReadApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{ entryId?: string; read?: boolean; all?: boolean; sourceId?: string }>(
    postData,
  );
  if (body?.all) {
    await markSubscribeTimelineRead(body.sourceId?.trim() || undefined);
    return legadoOk('已更新');
  }
  const entryId = body?.entryId?.trim() ?? '';
  if (!entryId) return legadoErr('缺少 entryId');
  await updateSubscribeEntryRead(entryId, body?.read !== false);
  return legadoOk('已更新');
}

export async function markAllSubscribeEntriesReadApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{ sourceId?: string }>(postData);
  await markSubscribeTimelineRead(body?.sourceId?.trim() || undefined);
  return legadoOk('已更新');
}

export async function markSubscribeEntryStarredApi(
  postData: string | null,
): Promise<LegadoReturnData<string>> {
  const body = parseBody<{ entryId?: string; starred?: boolean }>(postData);
  const entryId = body?.entryId?.trim() ?? '';
  if (!entryId) return legadoErr('缺少 entryId');
  await updateSubscribeEntryStarred(entryId, body?.starred !== false);
  return legadoOk('已更新');
}

export async function searchSubscribeEntriesApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<Awaited<ReturnType<typeof searchSubscribeEntries>>>> {
  const keyword = queryParam(query, 'q') ?? '';
  const entries = await searchSubscribeEntries(keyword, {
    unreadOnly: queryParam(query, 'unreadOnly') === '1',
    starredOnly: queryParam(query, 'starredOnly') === '1',
  });
  return legadoOk(entries);
}

export async function importSubscribeOpmlApi(
  postData: string | null,
): Promise<LegadoReturnData<Awaited<ReturnType<typeof importSubscribeOpml>>>> {
  const body = parseBody<{ xml?: string; content?: string }>(postData);
  const xml = body?.xml?.trim() || body?.content?.trim() || '';
  if (!xml) return legadoErr('缺少 OPML 内容');
  try {
    return legadoOk(await importSubscribeOpml(xml));
  } catch (error) {
    return legadoErr(error instanceof Error ? error.message : String(error));
  }
}

export async function exportSubscribeOpmlApi(): Promise<LegadoReturnData<{ opml: string }>> {
  const opml = await exportSubscribeOpml();
  return legadoOk({ opml });
}
