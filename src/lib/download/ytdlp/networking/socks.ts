/**
 * SOCKS / HTTP proxy URL normalization for yt-dlp params.proxy.
 * Rust reqwest (with `socks` feature) accepts socks5:// / socks5h:// / http://.
 */

export type ProxyKind = 'http' | 'https' | 'socks4' | 'socks5' | 'socks5h' | 'unknown';

export interface NormalizedProxy {
  /** URL suitable for reqwest Proxy::all */
  url: string;
  kind: ProxyKind;
  host: string;
  port: number;
  /** True when DNS resolves on proxy side (socks5h) */
  remoteDns: boolean;
}

/** Detect and normalize proxy strings (socks5://host:port, host:port, etc.). */
export function normalizeProxyUrl(raw?: string | null): NormalizedProxy | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  let url = s;
  // Bare host:port → assume socks5h (remote DNS) for yt-dlp-like convenience
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(url) || /^[\[\w.:-]+]:\d+$/.test(url)) {
      url = `socks5h://${url}`;
    } else {
      url = `http://${url}`;
    }
  }

  // Map socks4 → socks5 (reqwest has limited socks4); keep scheme if socks5*
  url = url.replace(/^socks4a?:\/\//i, 'socks5://');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  let kind: ProxyKind = 'unknown';
  if (scheme === 'http') kind = 'http';
  else if (scheme === 'https') kind = 'https';
  else if (scheme === 'socks5h') kind = 'socks5h';
  else if (scheme === 'socks5') kind = 'socks5';
  else if (scheme.startsWith('socks')) kind = 'socks5';

  const port =
    parsed.port ? Number(parsed.port) : kind === 'http' || kind === 'https' ? (kind === 'https' ? 443 : 80) : 1080;

  return {
    url: parsed.toString().replace(/\/$/, ''),
    kind,
    host: parsed.hostname,
    port,
    remoteDns: kind === 'socks5h',
  };
}

/** Validate proxy for ytdlp options; returns error message or null. */
export function validateProxyUrl(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const n = normalizeProxyUrl(raw);
  if (!n) return `Invalid proxy URL: ${raw}`;
  if (n.kind === 'unknown') return `Unsupported proxy scheme in: ${raw}`;
  return null;
}

/** Resolve YoutubeDL proxy param → engine-ready URL (or undefined). */
export function resolveYtdlpProxy(proxy?: string | null): string | undefined {
  const n = normalizeProxyUrl(proxy);
  return n?.url;
}
