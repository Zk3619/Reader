/**
 * Web 服务桥接：Tauri Rust HTTP / 纯 Web Vite SSE / WebSocket 调试
 */

import { isTauri } from '@/lib/platform/detect';
import { dispatchLegadoWebApi, type WebApiRequest } from '@/lib/web-api/dispatch';
import { serializeWebApiDispatchResult } from '@/lib/web-api/response';
import { runBookSourceDebugWebSocket } from '@/lib/web-api/book-source-debug-ws';
import { runRssSourceDebugWebSocket } from '@/lib/web-api/rss-source-debug-ws';
import { runSearchBookWebSocket } from '@/lib/web-api/search-book-ws';

export const WEB_API_REQUEST_EVENT = 'reader-web-api-request';
export const WEB_WS_DEBUG_EVENT = 'reader-web-ws-debug';

export type WebApiRequestPayload = {
  id: string;
  path: string;
  method: string;
  body?: string | null;
  query?: Record<string, string>;
  headers?: Record<string, string>;
};

export type WebWsDebugPayload = {
  id: string;
  path: string;
  message: string;
};

let tauriBridgeInstalled = false;
let tauriWsBridgeInstalled = false;
let browserBridgeActive = false;
let browserEventSource: EventSource | null = null;

async function handleWebApiRequest(payload: {
  id: string;
  path: string;
  method: string;
  body?: string | null;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<string> {
  try {
    const result = await dispatchLegadoWebApi({
      path: payload.path,
      method: payload.method.toUpperCase() as WebApiRequest['method'],
      body: payload.body ?? null,
      query: payload.query,
      headers: payload.headers,
    });
    return serializeWebApiDispatchResult(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return serializeWebApiDispatchResult({
      kind: 'json',
      payload: { isSuccess: false, errorMsg: msg, data: null },
    });
  }
}

export async function ensureWebApiBridge(): Promise<void> {
  if (!isTauri() || tauriBridgeInstalled) return;
  tauriBridgeInstalled = true;

  const { listen } = await import('@tauri-apps/api/event');
  const { invoke } = await import('@tauri-apps/api/core');

  await listen<WebApiRequestPayload>(WEB_API_REQUEST_EVENT, async (event) => {
    const { id, path, method, body, query, headers } = event.payload;
    const response = await handleWebApiRequest({ id, path, method, body, query, headers });
    await invoke('web_api_complete_cmd', { id, response });
  });
}

export async function ensureWebWsDebugBridge(): Promise<void> {
  if (!isTauri() || tauriWsBridgeInstalled) return;
  tauriWsBridgeInstalled = true;

  const { listen } = await import('@tauri-apps/api/event');
  const { invoke } = await import('@tauri-apps/api/core');

  await listen<WebWsDebugPayload>(WEB_WS_DEBUG_EVENT, async (event) => {
    const { id, path, message } = event.payload;
    const send = async (text: string) => {
      await invoke('web_ws_send_cmd', { id, text });
    };

    switch (path) {
      case '/bookSourceDebug':
        await runBookSourceDebugWebSocket(message, send);
        break;
      case '/rssSourceDebug':
        await runRssSourceDebugWebSocket(message, send);
        break;
      case '/searchBook':
        await runSearchBookWebSocket(message, send);
        break;
      default:
        return;
    }
    await invoke('web_ws_close_cmd', { id });
  });
}

async function connectBrowserBridge(): Promise<void> {
  if (isTauri() || typeof EventSource === 'undefined') return;
  if (browserBridgeActive && browserEventSource) return;

  browserEventSource?.close();
  const es = new EventSource('/__legado_bridge/stream');
  browserEventSource = es;

  es.onmessage = (event) => {
    void (async () => {
      try {
        const parsed = JSON.parse(String(event.data)) as {
          type?: string;
          id?: string;
          path?: string;
          method?: string;
          body?: string | null;
          query?: Record<string, string>;
          headers?: Record<string, string>;
        };
        if (parsed.type !== 'request' || !parsed.id || !parsed.path || !parsed.method) return;
        const response = await handleWebApiRequest({
          id: parsed.id,
          path: parsed.path,
          method: parsed.method,
          body: parsed.body ?? null,
          query: parsed.query,
          headers: parsed.headers,
        });
        await fetch('/__legado_bridge/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parsed.id, response }),
        });
      } catch (e) {
        console.warn('[web-api] browser bridge request failed', e);
      }
    })();
  };

  es.onerror = () => {
    browserBridgeActive = false;
  };

  browserBridgeActive = true;
}

function disconnectBrowserBridge(): void {
  browserEventSource?.close();
  browserEventSource = null;
  browserBridgeActive = false;
}

export async function startReaderWebService(port?: number): Promise<void> {
  if (isTauri()) {
    await ensureWebApiBridge();
    await ensureWebWsDebugBridge();
    const { invoke } = await import('@tauri-apps/api/core');
    const {
      getWebServicePort,
      isWebServiceAuthEnabled,
      getWebServiceToken,
    } = await import('@/lib/web-api/config');
    const p = port ?? (await getWebServicePort());
    await invoke('start_reader_web_service_cmd', {
      port: p,
      authEnabled: await isWebServiceAuthEnabled(),
      authToken: await getWebServiceToken(),
    });
    return;
  }
  await connectBrowserBridge();
}

export async function stopReaderWebService(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_reader_web_service_cmd');
    return;
  }
  disconnectBrowserBridge();
}

export async function tryAutoStartWebService(): Promise<void> {
  const { isWebServiceEnabled, getWebServicePort } = await import('@/lib/web-api/config');
  if (!(await isWebServiceEnabled())) return;
  try {
    await startReaderWebService(await getWebServicePort());
  } catch (e) {
    console.warn('[web-api] 自动启动 Web 服务失败', e);
  }
}

export function isBrowserWebApiBridgeActive(): boolean {
  return browserBridgeActive;
}
