/**
 * 本地遥控 API 客户端（对齐 LOCAL.md 子集）
 */

import { resolveProxyBaseUrl } from '../proxy/client';

export async function getLocalApiBase(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('tv_local_api_base_url');
  } catch {
    const proxy = await resolveProxyBaseUrl();
    return proxy.replace(/\/proxy$/, '');
  }
}

export async function pingLocalApi(): Promise<boolean> {
  try {
    const base = await getLocalApiBase();
    const res = await fetch(`${base}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
