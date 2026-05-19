/**
 * 内嵌 iframe ↔ 主窗口 postMessage 桥（主窗口代理 Tauri Cookie API，iframe 不直接访问 Tauri）
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './detect';

export const INNER_WEB_MESSAGE_CHANNEL = 'reader-inner-web';

export interface InnerWebBridgeMessage {
  channel: typeof INNER_WEB_MESSAGE_CHANNEL;
  id: string;
  method: string;
  args?: Record<string, unknown>;
}

type MessageSource = MessageEventSource | null | undefined;

let listening = false;
let allowedOrigin = '';

function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return false;
  if (!allowedOrigin) return origin.startsWith('https://') || origin.startsWith('http://');
  return origin === allowedOrigin;
}

function reply(
  source: MessageSource,
  origin: string,
  id: string,
  payload: { result?: unknown; error?: string }
): void {
  if (!source || typeof (source as Window).postMessage !== 'function') return;
  try {
    (source as Window).postMessage(
      {
        channel: INNER_WEB_MESSAGE_CHANNEL,
        id,
        ...payload,
      },
      origin
    );
  } catch (e) {
    console.warn('[inner-web-bridge] postMessage reply failed', e);
  }
}

async function handleMethod(
  method: string,
  args: Record<string, unknown> | undefined
): Promise<unknown> {
  switch (method) {
    case 'iframeReady':
    case 'syncDocumentCookie': {
      if (!isTauri()) return true;
      const url = String(args?.url ?? '').trim();
      const cookie = String(args?.cookie ?? '').trim();
      if (!url.startsWith('http') || !cookie) return true;
      await invoke('sync_document_cookies_for_inner_web', { url, cookies: cookie });
      return true;
    }
    case 'getCookies': {
      if (!isTauri()) return '';
      const url = String(args?.url ?? '').trim();
      if (!url.startsWith('http')) return '';
      return invoke<string>('get_webview_cookies_for_url', { url });
    }
    default:
      throw new Error(`未知方法: ${method}`);
  }
}

function onMessage(ev: MessageEvent): void {
  const data = ev.data as InnerWebBridgeMessage | undefined;
  if (!data || data.channel !== INNER_WEB_MESSAGE_CHANNEL || !data.id || !data.method) return;
  if (!isAllowedOrigin(ev.origin)) return;

  void (async () => {
    try {
      const result = await handleMethod(data.method, data.args);
      reply(ev.source, ev.origin, data.id, { result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reply(ev.source, ev.origin, data.id, { error: msg });
    }
  })();
}

/** 打开内嵌 https 页时启动桥接（并确保子 frame 注入脚本已注册） */
export async function startInnerWebBridge(pageUrl: string): Promise<void> {
  try {
    allowedOrigin = new URL(pageUrl).origin;
  } catch {
    allowedOrigin = '';
  }
  if (!listening) {
    window.addEventListener('message', onMessage);
    listening = true;
  }
  if (isTauri()) {
    try {
      await invoke('ensure_inner_web_iframe_scripts');
    } catch (e) {
      console.warn('[inner-web-bridge] ensure_inner_web_iframe_scripts failed', e);
    }
  }
}

export function stopInnerWebBridge(): void {
  if (listening) {
    window.removeEventListener('message', onMessage);
    listening = false;
  }
  allowedOrigin = '';
}
