/**
 * MusicFree RequestForwarder 前端（对齐 Desktop requestForwarder/renderer）
 * Tauri：本机 127.0.0.1:52735+ 代理，供 <audio> 直连并附自定义 Header。
 * Web：不可用，调用方应降级为 blob 物化。
 */

import { isTauri } from '@/lib/platform/detect';

let cachedBase = '';
let readyPromise: Promise<string | null> | null = null;

export async function resolveMfRequestForwarderBaseUrl(): Promise<string | null> {
  if (!isTauri()) return null;
  if (cachedBase) return cachedBase;
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const base = await invoke<string>('music_request_forwarder_base_url');
        if (base?.trim()) {
          cachedBase = base.replace(/\/$/, '');
          return cachedBase;
        }
      } catch (err) {
        console.warn('[music-mf] request-forwarder unavailable', err);
      }
      return null;
    })();
  }
  return readyPromise;
}

export function clearMfRequestForwarderCache(): void {
  cachedBase = '';
  readyPromise = null;
}

export function isMfProxyRequired(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** 构建本地代理播放 URL；代理不可用或无需代理时返回 null */
export async function buildMfProxyPlayUrl(
  url: string,
  headers?: Record<string, string>,
  method = 'GET',
): Promise<string | null> {
  if (!isMfProxyRequired(url)) return null;
  const base = await resolveMfRequestForwarderBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams();
  params.set('url', url);
  if (method && method.toUpperCase() !== 'GET') {
    params.set('method', method.toUpperCase());
  }
  if (headers && Object.keys(headers).length > 0) {
    params.set('headers', JSON.stringify(headers));
  }
  return `${base}/?${params.toString()}`;
}
