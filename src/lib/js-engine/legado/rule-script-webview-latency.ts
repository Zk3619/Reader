/**
 * 对齐 Legado java.webView 内嵌的线路延迟检测脚本（AI风月 getTimeList 等）
 * 避免 iframe/Tauri WebView 加载含外链的 script 导致超时与语法错误
 */

import { request } from '@/lib/http';

const LATENCY_CHECK_TIMEOUT_MS = 3000;
const LATENCY_TIMEOUT_VALUE = 4000;
const LATENCY_ERROR_VALUE = 5000;

/** 从 webView HTML 中解析 checkUrls([...]) 的 URL 列表 */
export function extractLatencyCheckUrls(html: string): string[] | null {
  const marker = 'checkUrls([';
  const start = html.lastIndexOf(marker);
  if (start < 0) return null;

  let i = start + marker.length - 1;

  let depth = 0;
  const arrStart = i;
  for (; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(arrStart, i + 1)) as unknown;
          if (!Array.isArray(parsed) || parsed.length === 0) return null;
          if (!parsed.every((u) => typeof u === 'string' && /^https?:\/\//i.test(u))) {
            return null;
          }
          return parsed;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function isLatencyCheckWebViewHtml(html: string): boolean {
  if (!html.includes('checkUrls(')) return false;
  return extractLatencyCheckUrls(html) != null;
}

async function probeOneUrlLatency(url: string): Promise<number> {
  const start = Date.now();
  let probeUrl = url;
  if (probeUrl.endsWith('=')) {
    probeUrl += String(start);
  }

  try {
    await request(probeUrl, {
      method: 'GET',
      timeout: LATENCY_CHECK_TIMEOUT_MS,
      allowNon2xx: true,
      headers: { Range: 'bytes=0-0' },
    });
    return Date.now() - start;
  } catch {
    const elapsed = Date.now() - start;
    if (elapsed >= LATENCY_CHECK_TIMEOUT_MS - 80) {
      return LATENCY_TIMEOUT_VALUE;
    }
    return LATENCY_ERROR_VALUE;
  }
}

/** 并行探测 URL 延迟，返回与 Legado 脚本相同的 JSON 数组字符串 */
export async function probeUrlLatencyList(urls: string[]): Promise<string> {
  const results = await Promise.all(urls.map((u) => probeOneUrlLatency(u)));
  return JSON.stringify(results);
}

export function buildLatencyCheckWebViewCacheKey(urls: string[]): string {
  return `webView:latency:\0${urls.join('\0')}`;
}
