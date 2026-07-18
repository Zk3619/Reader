/**
 * 网络规则：ads / hosts / DoH / 代理偏好
 */

import * as VodConfig from '../config/vod-config';
import { request, type RequestOptions } from '@/lib/http';

export type TvNetSettings = {
  dohEnabled: boolean;
  dohUrl: string;
  proxyEnabled: boolean;
  proxyUrl: string;
};

export type NetworkPolicyResult = {
  ok: boolean;
  url: string;
  reason?: string;
  /** DoH 换 IP 后需带的 Host */
  headers?: Record<string, string>;
  /** HTTP/HTTPS 代理地址（如 http://127.0.0.1:7890），由底层 download_binary 消费 */
  proxy?: string;
};

const DEFAULTS: TvNetSettings = {
  dohEnabled: false,
  dohUrl: 'https://dns.alidns.com/dns-query',
  proxyEnabled: false,
  proxyUrl: '',
};

/** localStorage 不可用时的内存回退（测试 / 无 DOM） */
let memoryNet: TvNetSettings = { ...DEFAULTS };

function storageKey(k: string) {
  return `tv.net.${k}`;
}

export function getTvNetSettings(): TvNetSettings {
  try {
    return {
      dohEnabled: localStorage.getItem(storageKey('dohEnabled')) === '1',
      dohUrl: localStorage.getItem(storageKey('dohUrl')) || DEFAULTS.dohUrl,
      proxyEnabled: localStorage.getItem(storageKey('proxyEnabled')) === '1',
      proxyUrl: localStorage.getItem(storageKey('proxyUrl')) || '',
    };
  } catch {
    return { ...memoryNet };
  }
}

/** 仅写内存 + LS，不触发 tv.ui persist（供 hydrate / writeSnapshot） */
export function applyTvNetSettingsLocal(net: TvNetSettings): void {
  memoryNet = { ...net };
  try {
    localStorage.setItem(storageKey('dohEnabled'), net.dohEnabled ? '1' : '0');
    localStorage.setItem(storageKey('dohUrl'), net.dohUrl);
    localStorage.setItem(storageKey('proxyEnabled'), net.proxyEnabled ? '1' : '0');
    localStorage.setItem(storageKey('proxyUrl'), net.proxyUrl);
  } catch {
    /* */
  }
}

export function setTvNetSettings(partial: Partial<TvNetSettings>): TvNetSettings {
  const cur = { ...getTvNetSettings(), ...partial };
  applyTvNetSettingsLocal(cur);
  void import('@/lib/persistence/domains/tv-ui')
    .then((m) => m.persistTvUiNow())
    .catch(() => undefined);
  return cur;
}

export function isAdHost(hostname: string): boolean {
  const ads = VodConfig.getAds();
  const h = hostname.toLowerCase();
  return ads.some((a) => h === a.toLowerCase() || h.endsWith(`.${a.toLowerCase()}`));
}

/** hosts 规则形如 a=b 或 *=cdn.example.com */
export function resolveHostOverride(hostname: string): string | null {
  const rules = VodConfig.getHosts();
  for (const rule of rules) {
    const eq = rule.indexOf('=');
    if (eq < 0) continue;
    const from = rule.slice(0, eq).trim();
    const to = rule.slice(eq + 1).trim();
    if (from === '*' || from === hostname) return to;
    if (from.startsWith('*.') && hostname.endsWith(from.slice(1))) return to;
  }
  return null;
}

export async function resolveViaDoh(hostname: string): Promise<string | null> {
  const net = getTvNetSettings();
  if (!net.dohEnabled || !net.dohUrl) return null;
  try {
    const endpoint = net.dohUrl.includes('?')
      ? `${net.dohUrl}&name=${encodeURIComponent(hostname)}&type=A`
      : `${net.dohUrl}?name=${encodeURIComponent(hostname)}&type=A`;
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/dns-json' },
    });
    const json = (await res.json()) as { Answer?: Array<{ data?: string; type?: number }> };
    const a = json.Answer?.find((x) => x.type === 1 && x.data);
    return a?.data ?? null;
  } catch {
    return null;
  }
}

export async function applyNetworkPolicy(url: string): Promise<NetworkPolicyResult> {
  try {
    const u = new URL(url);
    if (isAdHost(u.hostname)) {
      return { ok: false, url, reason: 'blocked by ads' };
    }
    const originalHost = u.hostname;
    const override = resolveHostOverride(u.hostname);
    if (override) {
      u.hostname = override;
    }
    const headers: Record<string, string> = {};
    const dohIp = await resolveViaDoh(u.hostname);
    if (dohIp) {
      headers.Host = originalHost;
      u.hostname = dohIp;
    } else if (override && isIpLiteral(override)) {
      headers.Host = originalHost;
    }
    const net = getTvNetSettings();
    const proxy =
      net.proxyEnabled && net.proxyUrl.trim() ? net.proxyUrl.trim() : undefined;
    return {
      ok: true,
      url: u.toString(),
      headers: Object.keys(headers).length ? headers : undefined,
      proxy,
    };
  } catch {
    return { ok: true, url };
  }
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** 影视模块统一 HTTP：走网络策略 +（可选）后端代理 */
export async function tvRequest(
  url: string,
  options: RequestOptions = {},
): Promise<Awaited<ReturnType<typeof request>>> {
  const policy = await applyNetworkPolicy(url);
  if (!policy.ok) {
    throw new Error(policy.reason || 'blocked by network policy');
  }
  const headers = {
    ...(options.headers ?? {}),
    ...(policy.headers ?? {}),
  };
  return request(policy.url, {
    ...options,
    headers,
    useBackendHttp: options.useBackendHttp || !!policy.proxy || undefined,
    proxy: policy.proxy ?? options.proxy,
  });
}

export async function tvGet(
  url: string,
  options?: Omit<RequestOptions, 'method' | 'body'>,
): Promise<string> {
  const res = await tvRequest(url, { ...options, method: 'GET' });
  return res.text();
}
