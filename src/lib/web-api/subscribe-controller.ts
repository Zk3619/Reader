import {
  createSubscribeSource,
  listSubscribeDashboard,
  refreshSubscribeSource,
  removeSubscribeSource,
  searchSubscribeEntries,
  updateSubscribeEntryRead,
  updateSubscribeEntryStarred,
  updateSubscribeSourceEnabled,
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

export async function getSubscribeDashboardApi(
  query: Record<string, string> | undefined,
): Promise<LegadoReturnData<Awaited<ReturnType<typeof listSubscribeDashboard>>>> {
  const sourceId = queryParam(query, 'sourceId') ?? '';
  const unreadOnly = queryParam(query, 'unreadOnly') === '1';
  const starredOnly = queryParam(query, 'starredOnly') === '1';
  const keyword = queryParam(query, 'q') ?? '';
  const data = await listSubscribeDashboard({
    sourceId: sourceId || undefined,
    unreadOnly,
    starredOnly,
    query: keyword,
  });
  return legadoOk(data);
}

export async function createSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<{ id: string }>> {
  const body = parseBody<{ title?: string; url?: string; type?: 'opml' | 'rss' | 'atom' | 'json' }>(postData);
  const url = body?.url?.trim() ?? '';
  if (!url) return legadoErr('缺少 url');
  const id = await createSubscribeSource({
    title: body?.title?.trim() || url,
    url,
    type: body?.type,
  });
  return legadoOk({ id });
}

export async function refreshSubscribeSourceApi(
  postData: string | null,
): Promise<LegadoReturnData<{ count: number }>> {
  const body = parseBody<{ sourceId?: string }>(postData);
  const sourceId = body?.sourceId?.trim() ?? '';
  if (!sourceId) return legadoErr('缺少 sourceId');
  const count = await refreshSubscribeSource(sourceId);
  return legadoOk({ count });
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
  const body = parseBody<{ entryId?: string; read?: boolean }>(postData);
  const entryId = body?.entryId?.trim() ?? '';
  if (!entryId) return legadoErr('缺少 entryId');
  await updateSubscribeEntryRead(entryId, body?.read !== false);
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
