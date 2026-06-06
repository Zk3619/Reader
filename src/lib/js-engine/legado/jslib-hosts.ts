/** jsLib 内 host(s) 数组与静态资源 URL 的区分（供聚合线路解析共用） */

const HOST_ARRAY_RE = /(?:var|let|const)\s+hosts?\s*=\s*\[([\s\S]*?)\];/;

const STATIC_ASSET_PATH_RE =
  /\.(css|js|svg|png|jpe?g|gif|webp|woff2?|ttf|ico|map)(\?|$)/i;

/** 排除 HTML 模板里的 CDN、命名空间等非 API 地址 */
export function isPlausibleBookSourceServerUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'www.w3.org') return false;
    const path = u.pathname.replace(/\/+$/, '');
    if (STATIC_ASSET_PATH_RE.test(path)) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'legado.gyks.cf' || host === 'sy.gyks.cf') return false;
    return true;
  } catch {
    return false;
  }
}

function extractQuotedHttpUrls(block: string): string[] {
  const urls: string[] = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const url = m[1].trim();
    if (isPlausibleBookSourceServerUrl(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/** 从 jsLib 的 host(s) 数组提取聚合线路；无数组时回退为过滤后的全文扫描 */
export function parseHostsFromJsLib(jsLib: unknown): string[] {
  const s = typeof jsLib === 'string' ? jsLib : '';
  if (!s) return [];

  const hostArrayMatch = s.match(HOST_ARRAY_RE);
  if (hostArrayMatch) {
    const fromArray = extractQuotedHttpUrls(hostArrayMatch[1]);
    if (fromArray.length > 0) return fromArray;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const url = m[1].trim();
    if (!isPlausibleBookSourceServerUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
