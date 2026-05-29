/**
 * Legado 阅读 Web 服务 HTTP / WebSocket 入口（对齐 modules/web parseLeagdoHttpUrlWithDefault）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'legado_web_http_entry';
const DEFAULT_HTTP = 'http://127.0.0.1:1234';

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 由 HTTP 入口推导 WebSocket 入口（端口 +1，或 https→444 / http→81） */
export function parseLegadoHttpAndWebSocketUrls(httpInput: string): [http: string, ws: string] {
  let url: URL;
  if (isHttpUrl(httpInput)) {
    url = new URL(httpInput.trim());
  } else {
    url = new URL(DEFAULT_HTTP);
  }

  const { protocol, port } = url;
  let wsPort: string;
  if (port !== '') {
    wsPort = String(Number(port) + 1);
  } else {
    wsPort = protocol.startsWith('https:') ? '444' : '81';
  }
  const wsProtocol = protocol.startsWith('https:') ? 'wss:' : 'ws:';

  const httpEntry = url.toString();
  const wsUrl = new URL(url.toString());
  wsUrl.protocol = wsProtocol;
  wsUrl.port = wsPort;
  return [httpEntry, wsUrl.toString()];
}

export function buildBookSourceDebugWebSocketUrl(wsEntry: string): string {
  const base = wsEntry.endsWith('/') ? wsEntry : `${wsEntry}/`;
  return new URL('bookSourceDebug', base).toString();
}

export async function readLegadoWebHttpEntry(): Promise<string> {
  const stored = await getStorage<string>(STORAGE_KEY);
  if (stored?.trim() && isHttpUrl(stored)) return stored.trim();
  return DEFAULT_HTTP;
}

export async function writeLegadoWebHttpEntry(httpEntry: string): Promise<void> {
  await setStorage(STORAGE_KEY, httpEntry.trim());
}
