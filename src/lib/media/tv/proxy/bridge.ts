/**
 * JS Spider proxy 桥：Rust /proxy?do=js → emit → 此处处理 → tv_proxy_resolve
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { jsEngine } from '../spider/js-engine';
import { getSite } from '../config/vod-config';

let started = false;
let unlisten: UnlistenFn | null = null;

type ProxyRequestPayload = {
  id: number;
  params: Record<string, string>;
};

async function resolveProxy(
  id: number,
  code: number,
  mime: string,
  body: Uint8Array | string,
  headers: Record<string, string> = {},
): Promise<void> {
  const bytes =
    typeof body === 'string' ? new TextEncoder().encode(body) : body;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const bodyBase64 = btoa(binary);
  await invoke('tv_proxy_resolve', {
    id,
    code,
    mime,
    bodyBase64,
    headers,
  });
}

/**
 * 尝试调用 JS spider 的 proxy 钩子（若源脚本导出了 proxy）
 */
async function runJsProxy(params: Record<string, string>): Promise<{
  code: number;
  mime: string;
  body: string;
  headers: Record<string, string>;
}> {
  const siteKey = params.siteKey ?? '';
  const site = getSite(siteKey);
  if (!site) {
    return {
      code: 500,
      mime: 'application/json',
      body: JSON.stringify({ error: 'site not found', siteKey }),
      headers: {},
    };
  }
  try {
    const raw = await jsEngine.proxy?.(site, params);
    if (raw && typeof raw === 'object' && 'body' in raw) {
      const r = raw as {
        code?: number;
        mime?: string;
        body?: string;
        headers?: Record<string, string>;
      };
      return {
        code: r.code ?? 200,
        mime: r.mime ?? 'application/octet-stream',
        body: r.body ?? '',
        headers: r.headers ?? {},
      };
    }
    if (typeof raw === 'string') {
      return { code: 200, mime: 'application/json', body: raw, headers: {} };
    }
  } catch (e) {
    return {
      code: 500,
      mime: 'application/json',
      body: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      headers: {},
    };
  }
  return {
    code: 404,
    mime: 'application/json',
    body: JSON.stringify({ error: 'js spider has no proxy()', siteKey }),
    headers: {},
  };
}

export async function ensureTvProxyBridge(): Promise<void> {
  if (started) return;
  started = true;
  try {
    // 确保 Rust 侧已绑定 AppHandle 并监听端口
    await invoke('tv_proxy_base_url');
  } catch {
    /* web */
  }
  try {
    unlisten = await listen<ProxyRequestPayload>('tv-proxy-request', (ev) => {
      void (async () => {
        const { id, params } = ev.payload;
        try {
          const r = await runJsProxy(params ?? {});
          await resolveProxy(id, r.code, r.mime, r.body, r.headers);
        } catch (e) {
          await resolveProxy(
            id,
            500,
            'application/json',
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
          );
        }
      })();
    });
  } catch (e) {
    console.warn('[tv-proxy-bridge]', e);
    started = false;
  }
}

export function stopTvProxyBridge(): void {
  void unlisten?.();
  unlisten = null;
  started = false;
}
