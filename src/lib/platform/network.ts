/**
 * 网络类型检测（蜂窝流量提醒）
 */

import { isAndroid, isTauri } from '@/lib/platform/detect';

export type NetworkKind = 'offline' | 'wifi' | 'cellular' | 'unknown';

const listeners = new Set<(kind: NetworkKind) => void>();

let cachedKind: NetworkKind | null = null;
let androidProbePromise: Promise<NetworkKind> | null = null;

function mapAndroidType(raw: string): NetworkKind {
  switch (raw.toLowerCase()) {
    case 'wifi':
    case 'ethernet':
      return 'wifi';
    case 'cellular':
    case 'mobile':
      return 'cellular';
    case 'none':
    case 'offline':
      return 'offline';
    default:
      return 'unknown';
  }
}

function readNavigatorConnection(): NetworkKind {
  if (typeof navigator === 'undefined') return 'unknown';
  if (!navigator.onLine) return 'offline';
  const conn = (navigator as Navigator & {
    connection?: { type?: string };
  }).connection;
  // 仅信任 connection.type（传输介质）。effectiveType（2g/3g/4g）是带宽估计，
  // 桌面 Wi‑Fi/有线常报 4g，绝不能当作蜂窝网。
  const type = String(conn?.type ?? '').toLowerCase();
  if (type === 'cellular' || type === 'wimax') return 'cellular';
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  if (type === 'none') return 'offline';
  return 'unknown';
}

async function probeAndroidNetwork(): Promise<NetworkKind> {
  if (!isTauri() || !isAndroid()) return 'unknown';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<string>('get_android_network_type');
    return mapAndroidType(raw);
  } catch {
    return 'unknown';
  }
}

export async function refreshNetworkKind(): Promise<NetworkKind> {
  const fromNav = readNavigatorConnection();
  if (isTauri() && isAndroid()) {
    if (!androidProbePromise) {
      androidProbePromise = probeAndroidNetwork().finally(() => {
        androidProbePromise = null;
      });
    }
    const fromAndroid = await androidProbePromise;
    if (fromAndroid !== 'unknown') {
      cachedKind = fromAndroid;
      return fromAndroid;
    }
  }
  cachedKind = fromNav;
  return fromNav;
}

export function getNetworkKind(): NetworkKind {
  return cachedKind ?? readNavigatorConnection();
}

export function isCellularNetwork(): boolean {
  return getNetworkKind() === 'cellular';
}

function notifyListeners(kind: NetworkKind): void {
  cachedKind = kind;
  for (const l of listeners) l(kind);
}

export function subscribeNetworkKind(listener: (kind: NetworkKind) => void): () => void {
  listeners.add(listener);
  void refreshNetworkKind().then(listener);
  if (typeof window === 'undefined') return () => listeners.delete(listener);
  const onChange = () => {
    void refreshNetworkKind().then(notifyListeners);
  };
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
  conn?.addEventListener?.('change', onChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
    conn?.removeEventListener?.('change', onChange);
  };
}
