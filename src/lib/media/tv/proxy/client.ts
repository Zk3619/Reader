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

/** 外链媒体走本地 do=http，规避 WebView CORS；可选附带上游所需头（原生 <video> 无法自定义请求头） */
export function wrapMediaThroughProxy(
  url: string,
  proxyBase: string,
  headers?: Record<string, string>,
): string {
  if (!url || !proxyBase) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  const merged = { ...inferDefaultMediaHeaders(url), ...(headers ?? {}) };
  if (/\/proxy\?/i.test(url) || url.includes('do=http')) {
    const fixed = fixLocalProxyUrl(url, proxyBase);
    return appendProxyHeaders(fixed, merged);
  }
  try {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return fixLocalProxyUrl(url, proxyBase);
    }
  } catch {
    return url;
  }
  const base = proxyBase.replace(/\/$/, '');
  let out = `${base}?do=http&url=${encodeURIComponent(url)}`;
  out = appendProxyHeaders(out, merged);
  return out;
}

/**
 * 本地已落盘文件走 do=file（Accept-Ranges + ACAO:*），
 * 供 <video crossOrigin> Range 抽帧 / SpriteStore，不整包进内存。
 */
export function wrapLocalFileThroughProxy(filePath: string, proxyBase: string): string {
  const path = filePath.trim().replace(/^file:\/\//i, '');
  if (!path || !proxyBase) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (/\/proxy\?/i.test(path) && /[?&]do=file\b/i.test(path)) {
    return fixLocalProxyUrl(path, proxyBase);
  }
  const base = proxyBase.replace(/\/$/, '');
  return `${base}?do=file&path=${encodeURIComponent(path)}`;
}

/** 常见防盗链 CDN 缺 Referer 时补站点根 */
export function inferDefaultMediaHeaders(url: string): Record<string, string> {
  const lower = url.toLowerCase();
  const out: Record<string, string> = {};
  if (
    /qpic\.cn|v\.qq|qq\.com|tfogc\.com|vfiles\.gtimg/i.test(lower)
  ) {
    out.Referer = 'https://v.qq.com/';
  } else if (/iqiyi\.com|qy\.net|qiyi\.com/i.test(lower)) {
    out.Referer = 'https://www.iqiyi.com/';
  } else if (/youku\.com|ykimg\.com/i.test(lower)) {
    out.Referer = 'https://www.youku.com/';
  } else if (/bilivideo|bilibili\.com|hdslb\.com/i.test(lower)) {
    out.Referer = 'https://www.bilibili.com/';
  } else if (/mgtv\.com|hitv\.com/i.test(lower)) {
    out.Referer = 'https://www.mgtv.com/';
  } else if (/miguvideo\.com|migu\.cn/i.test(lower)) {
    out.Referer = 'https://www.miguvideo.com/';
  }
  return out;
}

/** 把 Referer / UA / Cookie 写入 proxy query，供 Rust do=http 转上游 */
export function appendProxyHeaders(
  proxyUrl: string,
  headers?: Record<string, string>,
): string {
  if (!headers || !proxyUrl) return proxyUrl;
  try {
    const u = new URL(proxyUrl);
    const put = (name: string, value: string | undefined) => {
      if (!value?.trim()) return;
      if (!u.searchParams.has(name)) u.searchParams.set(name, value.trim());
    };
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k && v != null) lower[k.toLowerCase()] = String(v);
    }
    put('Referer', lower.referer);
    put('User-Agent', lower['user-agent']);
    put('Cookie', lower.cookie);
    return u.toString();
  } catch {
    return proxyUrl;
  }
}

/**
 * 对齐 fongmi ImgUtil.getUrl：解析 `@Headers=` / `@Cookie=` / `@Referer=` / `@User-Agent=`，
 * 再经本地 proxy 拉取（移动端 WebView 直连常因 Referer/CORS 失败）。
 */
export function wrapTvImageThroughProxy(
  rawUrl: string,
  proxyBase: string,
): string {
  if (!rawUrl?.trim() || !proxyBase) return rawUrl ?? '';
  let url = rawUrl.trim();
  if (url.startsWith('data:')) return url;
  const headers: Record<string, string> = {};
  if (url.includes('@Headers=')) {
    const raw = url.split('@Headers=')[1]?.split('@')[0] ?? '';
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj ?? {})) {
        if (v != null) headers[k] = String(v);
      }
    } catch {
      /* ignore */
    }
  }
  if (url.includes('@Cookie=')) {
    headers.Cookie = url.split('@Cookie=')[1]?.split('@')[0] ?? '';
  }
  if (url.includes('@Referer=')) {
    headers.Referer = url.split('@Referer=')[1]?.split('@')[0] ?? '';
  }
  if (url.includes('@User-Agent=')) {
    headers['User-Agent'] = url.split('@User-Agent=')[1]?.split('@')[0] ?? '';
  }
  if (Object.keys(headers).length || url.includes('@')) {
    url = url.split('@')[0] ?? url;
  }
  return wrapMediaThroughProxy(url, proxyBase, headers);
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
