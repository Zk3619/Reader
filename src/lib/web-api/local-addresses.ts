/**
 * 本机可用于 Web 服务的 IPv4 地址
 */

import { isTauri } from '@/lib/platform/detect';

let cachedAddresses: string[] | null = null;

export function clearLocalNetworkAddressesCache(): void {
  cachedAddresses = null;
}

export async function fetchLocalNetworkAddresses(port?: number): Promise<string[]> {
  if (cachedAddresses?.length) return cachedAddresses;

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedAddresses = await invoke<string[]>('get_local_network_addresses_cmd');
      return cachedAddresses;
    } catch (e) {
      console.warn('[web-api] 获取本机 IP 失败', e);
    }
  }

  if (port) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__reader/net-addresses`);
      const json = (await res.json()) as { isSuccess?: boolean; data?: string[] };
      if (json.isSuccess && Array.isArray(json.data) && json.data.length) {
        cachedAddresses = json.data;
        return cachedAddresses;
      }
    } catch {
      // Web 服务未启动或纯浏览器环境
    }
  }

  return ['127.0.0.1'];
}
