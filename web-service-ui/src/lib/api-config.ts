import { getStoredWebToken } from '@/lib/api-token';

const API_BASE_KEY = 'reader_web_api_base';
const PUSH_FAILED_KEY = 'reader_web_push_failed_sources';
const PUSH_FAILED_RSS_KEY = 'reader_web_push_failed_rss';

export function getApiBase(): string {
  try {
    const raw = localStorage.getItem(API_BASE_KEY)?.trim();
    if (!raw) return '';
    return raw.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function setApiBase(url: string): void {
  try {
    const trimmed = url.trim().replace(/\/$/, '');
    if (trimmed) localStorage.setItem(API_BASE_KEY, trimmed);
    else localStorage.removeItem(API_BASE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveApiUrl(path: string): string {
  const base = getApiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const token = getStoredWebToken();
  const qs = token && !normalized.includes('token=')
    ? `${normalized.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : '';
  if (!base) return `${normalized}${qs}`;
  return `${base}${normalized}${qs}`;
}

export function resolveWsUrl(path: string): string {
  const base = getApiBase();
  const token = getStoredWebToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';

  if (base) {
    try {
      const httpUrl = new URL(base);
      const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const httpPort = httpUrl.port
        ? Number(httpUrl.port)
        : httpUrl.protocol === 'https:' ? 443 : 80;
      const wsPort = httpPort + 1;
      return `${wsProtocol}//${httpUrl.hostname}:${wsPort}${path}${qs}`;
    } catch {
      /* fall through */
    }
  }

  const loc = window.location;
  const port = (Number(loc.port) || (loc.protocol === 'https:' ? 443 : 80)) + 1;
  const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = loc.hostname || '127.0.0.1';
  return `${wsProtocol}//${host}:${port}${path}${qs}`;
}

export function loadPushFailedUrls(): Set<string> {
  try {
    const raw = localStorage.getItem(PUSH_FAILED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function savePushFailedUrls(urls: Set<string>): void {
  try {
    localStorage.setItem(PUSH_FAILED_KEY, JSON.stringify([...urls]));
  } catch {
    /* ignore */
  }
}

export function markPushResults(
  submitted: string[],
  saved: string[],
): Set<string> {
  const savedSet = new Set(saved);
  const prev = loadPushFailedUrls();
  for (const url of submitted) {
    if (savedSet.has(url)) prev.delete(url);
    else prev.add(url);
  }
  savePushFailedUrls(prev);
  return new Set(submitted.filter((url) => !savedSet.has(url)));
}

export function loadRssPushFailedUrls(): Set<string> {
  try {
    const raw = localStorage.getItem(PUSH_FAILED_RSS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveRssPushFailedUrls(urls: Set<string>): void {
  try {
    localStorage.setItem(PUSH_FAILED_RSS_KEY, JSON.stringify([...urls]));
  } catch {
    /* ignore */
  }
}

export function markRssPushResults(submitted: string[], saved: string[]): Set<string> {
  const savedSet = new Set(saved);
  const prev = loadRssPushFailedUrls();
  for (const url of submitted) {
    if (savedSet.has(url)) prev.delete(url);
    else prev.add(url);
  }
  saveRssPushFailedUrls(prev);
  return new Set(submitted.filter((url) => !savedSet.has(url)));
}
