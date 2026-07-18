/**
 * 本地 proxy 基址（对齐 FongMi 9978–9998）
 */

let cachedBase = '';

export async function resolveProxyBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const base = await invoke<string>('tv_proxy_base_url');
    if (base) {
      cachedBase = base.replace(/\/$/, '');
      return cachedBase;
    }
  } catch {
    // web / unavailable
  }
  cachedBase = 'http://127.0.0.1:9978/proxy';
  return cachedBase;
}

/** 清除缓存（proxy 端口变更后） */
export function clearProxyBaseCache(): void {
  cachedBase = '';
}

export function rewriteProxyUrl(url: string, proxyBase: string): string {
  if (!url.startsWith('proxy://')) return url;
  const rest = url.slice('proxy://'.length);
  return `${proxyBase}?${rest}`;
}

/**
 * 修正 JAR 在 Proxy.port=-1 时生成的 `http://127.0.0.1:-1/proxy?...`
 * 以及配置里写死的 9978，统一改到当前实际监听端口。
 */
export function fixLocalProxyUrl(url: string, proxyBase: string): string {
  if (!url || !proxyBase) return url;
  try {
    const u = new URL(url);
    const base = new URL(proxyBase.includes('://') ? proxyBase : `http://${proxyBase}`);
    const hostOk = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    const pathOk = u.pathname === '/proxy' || u.pathname.startsWith('/proxy');
    if (!hostOk || !pathOk) return url;
    const portNum = u.port === '' ? -1 : Number(u.port);
    const badPort =
      u.port === '-1' ||
      !Number.isFinite(portNum) ||
      portNum <= 0 ||
      (portNum >= 9978 && portNum <= 9998 && base.port && String(portNum) !== base.port);
    if (badPort || (base.port && u.port !== base.port)) {
      u.protocol = base.protocol;
      u.hostname = base.hostname;
      u.port = base.port;
      return u.toString();
    }
  } catch {
    /* keep */
  }
  // 字面量兜底（URL 解析对 :-1 可能失败）
  if (/^https?:\/\/127\.0\.0\.1:-1\//i.test(url) || /^https?:\/\/localhost:-1\//i.test(url)) {
    try {
      const base = new URL(proxyBase);
      return url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost):-1/i, `${base.protocol}//${base.host}`);
    } catch {
      /* */
    }
  }
  return url;
}

/** 外链媒体走本地 do=http，规避 WebView CORS */
export function wrapMediaThroughProxy(url: string, proxyBase: string): string {
  if (!url || !proxyBase) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  if (/\/proxy\?/i.test(url) || url.includes('do=http')) return fixLocalProxyUrl(url, proxyBase);
  try {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return fixLocalProxyUrl(url, proxyBase);
    }
  } catch {
    return url;
  }
  const base = proxyBase.replace(/\/$/, '');
  return `${base}?do=http&url=${encodeURIComponent(url)}`;
}

export function isUsableHttpUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  if (url.includes(':-1')) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
