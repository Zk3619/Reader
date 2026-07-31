/**
 * Folo 实验账号：浏览器登录 / 粘贴 token / 拉取云订阅
 * 非官方集成，依赖对方 Better Auth 与 /subscriptions 契约。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { HttpError, request } from '@/lib/http';
import { getSubSourceByUrl } from '@/lib/database/subscribe';
import { FOLO_API_BASE_URL } from '@/lib/subscribe/folo-cloud';
import { createSubscribeSource } from '@/lib/subscribe/service';
import {
  clearSubscribeFoloAuth,
  getSubscribeFoloAuth,
  saveSubscribeFoloAuth,
  type SubscribeFoloAuthSnapshot,
} from '@/lib/persistence/domains/subscribe-folo-auth';

export const FOLO_WEB_LOGIN_BASE = 'https://app.folo.is/login';
const ONE_TIME_TOKEN_APPLY_PATH = '/better-auth/one-time-token/apply';
const ONE_TIME_TOKEN_VERIFY_PATH = '/better-auth/one-time-token/verify';
const SESSION_CHECK_PATH = '/better-auth/get-session';
const SUBSCRIPTIONS_PATH = '/subscriptions';
const DEFAULT_LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export interface FoloAuthSessionUser {
  name?: string;
  email?: string;
  image?: string;
}

export interface FoloAuthSessionPayload {
  user?: FoloAuthSessionUser | null;
  session?: { token?: string } | null;
}

export interface FoloCloudSubscriptionFeed {
  id?: string;
  url?: string;
  title?: string | null;
  description?: string | null;
  siteUrl?: string | null;
  image?: string | null;
}

export interface FoloCloudSubscriptionItem {
  category?: string | null;
  title?: string | null;
  feedId?: string;
  feeds?: FoloCloudSubscriptionFeed;
  lists?: unknown;
  inboxes?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeFoloSessionToken(token: string | undefined | null): string {
  const raw = String(token ?? '').trim();
  if (!raw) return '';
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function resolveFoloLoginUrl(callbackUrl: string, webBase = FOLO_WEB_LOGIN_BASE): string {
  const webUrl = new URL(webBase);
  webUrl.pathname = '/login';
  webUrl.search = '';
  webUrl.hash = '';
  webUrl.searchParams.set('cli_callback', callbackUrl);
  return webUrl.toString();
}

function authHeaders(token: string): Record<string, string> {
  const normalized = normalizeFoloSessionToken(token);
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${normalized}`,
    Cookie: `__Secure-better-auth.session_token=${normalized}; better-auth.session_token=${normalized}`,
  };
}

function extractSessionTokenFromSetCookie(headers: Record<string, string>): string | undefined {
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'set-cookie') continue;
    values.push(value);
  }
  for (const setCookie of values) {
    const match = setCookie.match(/(?:__Secure-)?better-auth\.session_token=([^;]+)/);
    if (match?.[1]) return normalizeFoloSessionToken(match[1]);
  }
  return undefined;
}

function extractSessionTokenFromBody(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  if (isRecord(data.session) && typeof data.session.token === 'string') {
    return normalizeFoloSessionToken(data.session.token);
  }
  return undefined;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  return fallback;
}

async function postAuthJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; headers: Record<string, string>; data: unknown }> {
  const response = await request(`${FOLO_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    allowNon2xx: true,
    timeout: 30_000,
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    data,
  };
}

export async function resolveFoloBrowserLoginToken(oneTimeToken: string): Promise<string> {
  const token = normalizeFoloSessionToken(oneTimeToken);
  if (!token) throw new Error('登录回调 token 为空');

  const apply = await postAuthJson(ONE_TIME_TOKEN_APPLY_PATH, { token });
  if (apply.ok) {
    const sessionToken =
      extractSessionTokenFromSetCookie(apply.headers) ?? extractSessionTokenFromBody(apply.data);
    if (!sessionToken) {
      throw new Error('登录成功但未返回会话 token');
    }
    return sessionToken;
  }

  let errorMessage = extractErrorMessage(apply.data, '浏览器登录 token 校验失败');

  if (apply.status === 404) {
    const verify = await postAuthJson(ONE_TIME_TOKEN_VERIFY_PATH, { token });
    if (verify.ok) {
      const sessionToken =
        extractSessionTokenFromSetCookie(verify.headers) ??
        extractSessionTokenFromBody(verify.data);
      if (!sessionToken) {
        throw new Error('登录校验成功但未返回会话 token');
      }
      return sessionToken;
    }
    errorMessage = extractErrorMessage(verify.data, errorMessage);
  }

  try {
    await fetchFoloAuthSession(token);
    return token;
  } catch {
    // fall through
  }

  throw new Error(errorMessage);
}

export async function fetchFoloAuthSession(sessionToken: string): Promise<FoloAuthSessionPayload> {
  const token = normalizeFoloSessionToken(sessionToken);
  if (!token) throw new Error('会话 token 为空');
  const response = await request(`${FOLO_API_BASE_URL}${SESSION_CHECK_PATH}`, {
    method: 'GET',
    headers: authHeaders(token),
    timeout: 30_000,
  });
  const data = (await response.json()) as FoloAuthSessionPayload;
  if (!data?.user || !data?.session) {
    throw new Error('会话无效或已过期');
  }
  return data;
}

async function persistSessionFromPayload(
  sessionToken: string,
  payload: FoloAuthSessionPayload,
): Promise<SubscribeFoloAuthSnapshot> {
  return saveSubscribeFoloAuth({
    sessionToken: normalizeFoloSessionToken(sessionToken),
    userName: String(payload.user?.name ?? ''),
    userEmail: String(payload.user?.email ?? ''),
    userImage: String(payload.user?.image ?? ''),
    loggedInAt: Date.now(),
  });
}

export async function loginFoloWithSessionToken(rawToken: string): Promise<SubscribeFoloAuthSnapshot> {
  const token = normalizeFoloSessionToken(rawToken);
  if (!token) throw new Error('请粘贴有效的会话 token');
  const session = await fetchFoloAuthSession(token);
  return persistSessionFromPayload(token, session);
}

export async function refreshFoloAuthSession(): Promise<SubscribeFoloAuthSnapshot | null> {
  const current = await getSubscribeFoloAuth();
  if (!current.sessionToken) return null;
  try {
    const session = await fetchFoloAuthSession(current.sessionToken);
    return persistSessionFromPayload(current.sessionToken, session);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      await clearSubscribeFoloAuth();
      return null;
    }
    throw error;
  }
}

export async function logoutFoloAccount(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('folo_auth_cancel_callback');
    } catch {
      // ignore
    }
  }
  await clearSubscribeFoloAuth();
}

export async function loginFoloWithBrowser(options?: {
  timeoutMs?: number;
  onStatus?: (message: string) => void;
}): Promise<SubscribeFoloAuthSnapshot> {
  if (!isTauri()) {
    throw new Error('浏览器登录仅支持桌面端；请改用手动粘贴会话 token');
  }
  const onStatus = options?.onStatus ?? (() => undefined);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;

  onStatus('正在启动本地回调…');
  const prepared = await invoke<{ callbackUrl: string; port: number }>(
    'folo_auth_prepare_callback',
  );
  const loginUrl = resolveFoloLoginUrl(prepared.callbackUrl);
  onStatus('已打开登录页，请在浏览器完成登录…');
  try {
    await openUrlInBrowser(loginUrl);
  } catch {
    onStatus(`请手动打开：${loginUrl}`);
  }

  let oneTimeToken = '';
  try {
    oneTimeToken = await invoke<string>('folo_auth_await_callback', { timeoutMs });
  } catch (error) {
    try {
      await invoke('folo_auth_cancel_callback');
    } catch {
      // ignore
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  onStatus('正在兑换会话…');
  const sessionToken = await resolveFoloBrowserLoginToken(oneTimeToken);
  const session = await fetchFoloAuthSession(sessionToken);
  return persistSessionFromPayload(sessionToken, session);
}

export async function fetchFoloCloudSubscriptions(
  sessionToken: string,
): Promise<FoloCloudSubscriptionItem[]> {
  const response = await request(`${FOLO_API_BASE_URL}${SUBSCRIPTIONS_PATH}`, {
    method: 'GET',
    headers: authHeaders(sessionToken),
    timeout: 45_000,
  });
  const payload = await response.json<unknown>();
  if (Array.isArray(payload)) return payload as FoloCloudSubscriptionItem[];
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data as FoloCloudSubscriptionItem[];
  }
  throw new Error('订阅列表响应无效');
}

export function collectFoloFeedSubscriptions(
  items: FoloCloudSubscriptionItem[],
): Array<{
  title: string;
  url: string;
  category: string;
  foloFeedId: string;
  siteUrl?: string | null;
  iconUrl?: string | null;
}> {
  const rows: Array<{
    title: string;
    url: string;
    category: string;
    foloFeedId: string;
    siteUrl?: string | null;
    iconUrl?: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.feeds || typeof item.feeds !== 'object') continue;
    const url = String(item.feeds.url ?? '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    rows.push({
      url,
      title: String(item.title || item.feeds.title || url).trim() || url,
      category: String(item.category ?? '').trim() || 'Folo 云同步',
      foloFeedId: String(item.feedId || item.feeds.id || '').trim(),
      siteUrl: item.feeds.siteUrl ?? null,
      iconUrl: item.feeds.image ?? null,
    });
  }
  return rows;
}

export async function syncFoloSubscriptionsToLocal(): Promise<{
  imported: number;
  skipped: number;
  total: number;
}> {
  const auth = await getSubscribeFoloAuth();
  if (!auth.sessionToken) throw new Error('尚未登录 Folo 账号');

  const remote = await fetchFoloCloudSubscriptions(auth.sessionToken);
  const feeds = collectFoloFeedSubscriptions(remote);
  let imported = 0;
  let skipped = 0;
  for (const feed of feeds) {
    const existing = await getSubSourceByUrl(feed.url);
    await createSubscribeSource({
      title: feed.title,
      url: feed.url,
      category: feed.category || existing?.category || 'Folo 云同步',
      foloFeedId: feed.foloFeedId || undefined,
      siteUrl: feed.siteUrl,
      iconUrl: feed.iconUrl,
    });
    if (existing) skipped += 1;
    else imported += 1;
  }

  await saveSubscribeFoloAuth({ lastSyncedAt: Date.now() });
  return { imported, skipped, total: feeds.length };
}
